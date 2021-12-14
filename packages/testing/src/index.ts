import * as activity from '@temporalio/activity';
import { URL } from 'url';
import { AsyncCompletionClient, Connection, WorkflowClient } from '@temporalio/client';
import { ActivityFunction, CancelledFailure } from '@temporalio/common';
import { Core } from '@temporalio/worker';
import { AbortController } from 'abort-controller';
import { ChildProcess, spawn } from 'child_process';
import events from 'events';
import http from 'http';
import { AddressInfo } from 'net';
import { kill, waitOnChild } from './child-process';
import { promisify } from 'util';

export async function listen(server: http.Server, port: number, hostname?: string): Promise<http.Server> {
  await new Promise<void>((resolve, reject) => {
    if (hostname) {
      server.listen(port, hostname, resolve);
    } else {
      server.listen(port, resolve);
    }
    server.once('error', reject);
  });
  return server;
}

export class PortCallbackServer {
  public readonly portPromise: Promise<number>;
  protected constructor(public readonly callbackAddress: string, protected server: http.Server) {
    this.portPromise = new Promise<number>((resolve, reject) => {
      server.once('request', (req, res) => {
        try {
          if (typeof req.headers.host !== 'string' || typeof req.url !== 'string') {
            throw new TypeError('URL or host header not set on request');
          }

          const url = new URL('http://' + req.headers.host + req.url);
          const port = parseInt(url.searchParams.get('port') ?? '');
          if (Number.isNaN(port)) {
            throw new TypeError('Invalid port in query params');
          }
          res.writeHead(200);
          resolve(port);
        } catch (err) {
          reject(err);
          res.writeHead(400);
        }
        res.end();
      });
    });
  }

  static async create() {
    const server = await listen(http.createServer(), 0, '127.0.0.1');
    const callbackPort = (server.address() as AddressInfo).port;
    const callbackAddress = `http://127.0.0.1:${callbackPort}`;
    return new this(callbackAddress, server);
  }

  public async close() {
    await promisify(this.server.close).bind(this.server)();
  }
}

export class TestEnvironment {
  protected constructor(protected readonly serverProc: ChildProcess, protected readonly conn: Connection) {}

  static async create() {
    const portCallbackServer = await PortCallbackServer.create();

    // TODO: make path configurable?
    const child = spawn(
      '/Users/bergundy/temporal/sdk-java/temporal-test-server/build/graal/temporal-test-server',
      ['0', portCallbackServer.callbackAddress],
      {
        stdio: 'ignore',
      }
    );

    const port = await portCallbackServer.portPromise;
    await portCallbackServer.close();

    const address = `127.0.0.1:${port}`;
    const conn = new Connection({ address });

    try {
      await Promise.race([
        conn.untilReady(),
        waitOnChild(child).then(() => {
          throw new Error('Child exited prematurely');
        }),
      ]);
    } catch (err) {
      await kill(child);
      throw err;
    }
    // TODO: support multiple core instances
    await Core.install({ serverOptions: { address } });
    return new this(child, conn);
  }

  get connection() {
    return this.conn;
  }

  get asyncCompletionClient() {
    return new AsyncCompletionClient(this.conn.service);
  }

  get workflowClient() {
    return new WorkflowClient(this.conn.service);
  }

  async teardown() {
    this.conn.client.close();
    // TODO: the server should return exit code 0
    await kill(this.serverProc, 'SIGINT', { validReturnCodes: [130] });
  }
}

export class MockActivityEnvironment extends events.EventEmitter {
  public cancel: (reason?: any) => void = () => undefined;
  public readonly context: activity.Context;

  constructor(info: activity.Info) {
    super();
    const abortController = new AbortController();
    const promise = new Promise<never>((_, reject) => {
      this.cancel = (reason?: any) => {
        abortController.abort();
        reject(new CancelledFailure(reason));
      };
    });
    const heartbeatCallback = (details?: unknown) => this.emit('heartbeat', details);
    this.context = new activity.Context(info, promise, abortController.signal, heartbeatCallback);
  }

  public run<P extends any[], R, F extends ActivityFunction<P, R>>(fn: F, ...args: P): Promise<R> {
    return activity.asyncLocalStorage.run(this.context, fn, ...args);
  }
}
