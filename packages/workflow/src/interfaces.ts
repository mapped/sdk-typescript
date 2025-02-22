import type { coresdk } from '@temporalio/proto/lib/coresdk';
import { CommonWorkflowOptions } from '@temporalio/internal-workflow-common';
import { checkExtends } from '@temporalio/internal-workflow-common';

/**
 * Workflow execution information
 */
export interface WorkflowInfo {
  /**
   * ID of the Workflow, this can be set by the client during Workflow creation.
   * A single Workflow may run multiple times e.g. when scheduled with cron.
   */
  workflowId: string;
  /**
   * ID of a single Workflow run
   */
  runId: string;

  /**
   * Filename containing the Workflow code
   */
  workflowType: string;

  /**
   * Namespace this Workflow is scheduled in
   */
  namespace: string;

  /**
   * Task queue this Workflow is scheduled in
   */
  taskQueue: string;

  /**
   * Whether a Workflow is replaying history or processing new events
   */
  isReplaying: boolean;
}

/**
 * Not an actual error, used by the Workflow runtime to abort execution when {@link continueAsNew} is called
 */
export class ContinueAsNew extends Error {
  public readonly name = 'ContinueAsNew';

  constructor(public readonly command: coresdk.workflow_commands.IContinueAsNewWorkflowExecution) {
    super('Workflow continued as new');
  }
}

/**
 * Options for continuing a Workflow as new
 */
export interface ContinueAsNewOptions {
  /**
   * A string representing the Workflow type name, e.g. the filename in the Node.js SDK or class name in Java
   */
  workflowType?: string;
  /**
   * Task queue to continue the Workflow in
   */
  taskQueue?: string;
  /**
   * Timeout for the entire Workflow run
   * @format {@link https://www.npmjs.com/package/ms | ms} formatted string
   */
  workflowRunTimeout?: string;
  /**
   * Timeout for a single Workflow task
   * @format {@link https://www.npmjs.com/package/ms | ms} formatted string
   */
  workflowTaskTimeout?: string;
  /**
   * Non-searchable attributes to attach to next Workflow run
   */
  memo?: Record<string, any>;
  /**
   * Searchable attributes to attach to next Workflow run
   */
  searchAttributes?: Record<string, any>;
}

export enum ChildWorkflowCancellationType {
  ABANDON = 0,
  TRY_CANCEL = 1,
  WAIT_CANCELLATION_COMPLETED = 2,
  WAIT_CANCELLATION_REQUESTED = 3,
}

checkExtends<coresdk.child_workflow.ChildWorkflowCancellationType, ChildWorkflowCancellationType>();

export enum ParentClosePolicy {
  PARENT_CLOSE_POLICY_UNSPECIFIED = 0,
  PARENT_CLOSE_POLICY_TERMINATE = 1,
  PARENT_CLOSE_POLICY_ABANDON = 2,
  PARENT_CLOSE_POLICY_REQUEST_CANCEL = 3,
}

checkExtends<coresdk.child_workflow.ParentClosePolicy, ParentClosePolicy>();

export interface ChildWorkflowOptions extends CommonWorkflowOptions {
  /**
   * Workflow id to use when starting. If not specified a UUID is generated. Note that it is
   * dangerous as in case of client side retries no deduplication will happen based on the
   * generated id. So prefer assigning business meaningful ids if possible.
   */
  workflowId?: string;

  /**
   * Task queue to use for Workflow tasks. It should match a task queue specified when creating a
   * `Worker` that hosts the Workflow code.
   */
  taskQueue?: string;

  /**
   * In case of a child workflow cancellation it fails with a CanceledFailure.
   * The type defines at which point the exception is thrown.
   * @default ChildWorkflowCancellationType.WAIT_CANCELLATION_COMPLETED
   */
  cancellationType?: ChildWorkflowCancellationType;
  /**
   * Specifies how this workflow reacts to the death of the parent workflow.
   */
  parentClosePolicy?: ParentClosePolicy;
}

export type RequiredChildWorkflowOptions = Required<Pick<ChildWorkflowOptions, 'workflowId' | 'cancellationType'>> & {
  args: unknown[];
};

export type ChildWorkflowOptionsWithDefaults = ChildWorkflowOptions & RequiredChildWorkflowOptions;
