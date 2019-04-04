import db from "debug";
import * as path from "path";

/*
 * IMPORTANT NOTE
 * This file primarily operates on the results from the user's program,
 * which runs in its own V8 context. Don't use our (outer) Adapt or other
 * things imported here to operate on those results.
 * It is safe to use types from the outer context, but be VERY careful that
 * you know what you're doing if you import and use objects or functions
 * in this file.
 *
 * In order to make it more obvious which types/objects we're importing,
 * NEVER "import * from " in this file.
 */
// @ts-ignore
import AdaptDontUse, {
    AdaptElementOrNull,
    Message,
    ProjectBuildError,
} from "..";

// @ts-ignore
// tslint:disable-next-line:variable-name prefer-const
let Adapt: never;

import { immediatePromise, TaskObserver } from "@usys/utils";
import { createPluginManager } from "../deploy/plugin_support";
import { buildPrinter } from "../dom_build_data_recorder";
import { InternalError } from "../error";
import { AdaptMountedElement } from "../jsx";
import {
    ExecutedQuery,
} from "../observers";
import { Deployment } from "../server/deployment";
import { HistoryStatus } from "../server/history";
import { createStateStore, StateStore } from "../state";
import { Status } from "../status";
import { AdaptContext, projectExec } from "../ts";
import { DeployState, DeploySuccess, parseDebugString } from "./common";
import { parseFullObservationsJson, stringifyFullObservations } from "./serialize";

const debugAction = db("adapt:ops:action");
const debugDeployDom = db("adapt:ops:deploydom");

export interface BuildOptions {
    debug: string;
    deployment: Deployment;
    dryRun: boolean;
    fileName: string;
    stackName: string;
    taskObserver: TaskObserver;

    withStatus?: boolean;
    observationsJson?: string;
    prevStateJson?: string;
    projectRoot?: string;
}

export interface FullBuildOptions extends Required<BuildOptions> {
    ctx?: AdaptContext;
}

export function computePaths(options: BuildOptions): { fileName: string, projectRoot: string } {
    const fileName = path.resolve(options.fileName);
    const projectRoot = options.projectRoot || path.dirname(fileName);
    return { fileName, projectRoot };
}

export function initialState(options: BuildOptions): FullBuildOptions {
    const paths = computePaths(options);
    return {
        ...options,
        ...paths,
        withStatus: options.withStatus || false,
        observationsJson: options.observationsJson || JSON.stringify({}),
        prevStateJson: options.prevStateJson || "{}",
    };
}

export async function currentState(options: BuildOptions): Promise<FullBuildOptions> {
    const { deployment } = options;
    const prev = await deployment.lastEntry(HistoryStatus.complete);
    if (!prev) return initialState(options);
    const paths = computePaths(options);
    return {
        ...options,
        ...paths,
        withStatus: options.withStatus || false,
        observationsJson: options.observationsJson || prev.observationsJson,
        prevStateJson: options.prevStateJson || prev.stateJson
    };
}

interface ExecutedQueries {
    [name: string]: ExecutedQuery[];
}

export interface BuildResults extends FullBuildOptions {
    domXml: string;
    mountedOrigStatus: Status;
    executedQueries: ExecutedQueries;
    needsData: ExecutedQueries;
}

function podify<T>(x: T): T {
    return JSON.parse(JSON.stringify(x));
}

export async function build(options: FullBuildOptions): Promise<BuildResults> {
    return withContext(options, async (ctx: AdaptContext) => {
        const { deployment, taskObserver, stackName } = options;
        const logger = taskObserver.logger;

        const prevStateJson = options.prevStateJson;
        const observations = parseFullObservationsJson(options.observationsJson);
        const observerObservations = observations.observer || {};
        const debugFlags = parseDebugString(options.debug);
        const recorder = debugFlags.build ? buildPrinter() : undefined;

        // This is the inner context's copy of Adapt
        const inAdapt = ctx.Adapt;

        const stacks = ctx.adaptStacks;
        if (!stacks) throw new InternalError(`No stacks found`);
        const stack = stacks.get(stackName);
        if (!stack) throw new Error(`Adapt stack '${stackName}' not found`);

        let stateStore: StateStore;
        try {
            stateStore = createStateStore(prevStateJson);
        } catch (err) {
            let msg = `Invalid previous state JSON`;
            if (err.message) msg += `: ${err.message}`;
            throw new Error(msg);
        }

        let mountedOrig: AdaptMountedElement | null = null;
        let newDom: AdaptElementOrNull = null;
        let buildMessages: Message[] = [];
        let executedQueries: ExecutedQueries = {};

        let needsData: ExecutedQueries = {};
        const root = await stack.root;
        const style = await stack.style;
        if (root != null) {
            const observeManager = inAdapt.internal.makeObserverManagerDeployment(observerObservations);

            const results = await inAdapt.build(
                root, style, {
                    deployID: deployment.deployID,
                    observerManager: observeManager,
                    recorder,
                    stateStore,
                });

            newDom = results.contents;
            mountedOrig = results.mountedOrig;
            buildMessages = results.messages;
            executedQueries = podify(observeManager.executedQueries());
            needsData = podify(observeManager.executedQueriesThatNeededData());
        }

        if (buildMessages.length !== 0) {
            logger.append(buildMessages);
            throw new ProjectBuildError(inAdapt.serializeDom(newDom));
        }

        return {
            ...options,
            ctx,
            domXml: inAdapt.serializeDom(newDom, { reanimateable: true }),
            mountedOrigStatus: (mountedOrig && options.withStatus) ?
                podify(await mountedOrig.status()) : { noStatus: true },
            needsData,
            executedQueries,
            prevStateJson: stateStore.serialize(),
        };
    });
}

interface ObserveResults extends FullBuildOptions {
    needsData: ExecutedQueries;
}

interface ObserveOptions extends ObserveResults {
    executedQueries: ExecutedQueries;
}

export async function observe(options: ObserveOptions): Promise<ObserveResults> {
    debugAction(`observe: start`);
    const ret = withContext(options, async (ctx: AdaptContext) => {
        const { taskObserver } = options;
        const logger = taskObserver.logger;

        const origObservations = parseFullObservationsJson(options.observationsJson);
        // This is the inner context's copy of Adapt
        const inAdapt = ctx.Adapt;
        debugAction(`observe: run observers`);
        const observations = await inAdapt.internal.observe(options.executedQueries, logger);
        inAdapt.internal.patchInNewQueries(observations, options.executedQueries);
        const { executedQueries, ...orig } = options;
        return {
            ...orig,
            observationsJson: stringifyFullObservations({
                plugin: origObservations.plugin,
                observer: observations
            })
        };
    });
    debugAction(`observe: done`);
    return ret;
}

export async function withContext<T>(
    options: FullBuildOptions,
    f: (ctx: AdaptContext) => T | Promise<T>): Promise<T> {

    let ctx: AdaptContext | undefined = options.ctx;
    if (ctx === undefined) {
        // Compile and run the project
        debugAction(`buildAndDeploy: compile start`);
        const task = options.taskObserver.childGroup().task("compile");
        ctx = await task.complete(() => projectExec(options.projectRoot, options.fileName));
        debugAction(`buildAndDeploy: compile done`);
    }
    return f(ctx);
}

export async function deploy(options: BuildResults): Promise<DeployState> {
    const { deployment, stackName, taskObserver, fileName, projectRoot } = options;
    const tasks = taskObserver.childGroup().add({
        setup: "Setting up",
        reanimatePrev: "Reconstituting previous DOM",
        reanimateCur: "Reconstituting current DOM",
        observe: "Observing environment",
        analyze: "Analyzing environment",
        act: "Applying changes to environment",
    });
    const logger = taskObserver.logger;

    return withContext(options, async (ctx: AdaptContext): Promise<DeploySuccess> => {
        try {
            // This is the inner context's copy of Adapt
            const inAdapt = ctx.Adapt;

            const { prev, mgr } = await tasks.setup.complete(async () => {
                return {
                    prev: await deployment.lastEntry(HistoryStatus.complete),
                    mgr: createPluginManager(ctx.pluginModules),
                };
            });

            const prevDom = await tasks.reanimatePrev.complete(async () => {
                return prev ? inAdapt.internal.reanimateDom(prev.domXml) : null;
            });

            const { dataDir, newDom } = await tasks.reanimateCur.complete(async () => {
                // This grabs a lock on the deployment's uncommitted data dir
                return {
                    dataDir: await deployment.getDataDir(HistoryStatus.complete),
                    newDom: await inAdapt.internal.reanimateDom(options.domXml),
                };
            });

            debugDeployDom(inAdapt.serializeDom(newDom, { props: [ "key" ] }));

            const newPluginObs = await tasks.observe.complete(async () => {
                await mgr.start(prevDom, newDom, {
                    dataDir: path.join(dataDir, "plugins"),
                    deployment,
                    logger: tasks.act.logger,
                    taskObserver: tasks.act,
                });
                return mgr.observe();
            });

            await tasks.analyze.complete(() => mgr.analyze());

            return await tasks.act.complete(async (): Promise<DeploySuccess> => {
                const observationsJson = stringifyFullObservations({
                    plugin: newPluginObs,
                    observer: parseFullObservationsJson(options.observationsJson).observer
                });

                /*
                 * NOTE: There should be no deployment side effects prior to here, but
                 * once act is called, that is no longer true.
                 */
                let status = HistoryStatus.preAct;
                await commit();

                // Status is failed until we've completed everything
                status = HistoryStatus.failed;

                try {
                    await mgr.act(options.dryRun);
                    await mgr.finish();
                    status = HistoryStatus.success;

                    return {
                        type: "success",
                        deployID: options.dryRun ? "DRYRUN" : deployment.deployID,
                        domXml: options.domXml,
                        stateJson: options.prevStateJson,
                        //Move data from inner adapt to outer adapt via JSON
                        needsData: podify(inAdapt.internal.simplifyNeedsData(options.needsData)),
                        messages: logger.messages,
                        summary: logger.summary,
                        mountedOrigStatus: options.mountedOrigStatus,
                    };
                } finally {
                    await commit();
                }

                async function commit() {
                    if (!options.dryRun) {
                        await deployment.commitEntry({
                            dataDir,
                            domXml: options.domXml,
                            fileName,
                            observationsJson,
                            projectRoot,
                            stackName,
                            stateJson: options.prevStateJson,
                            status,
                        });
                    }
                }
            });

        } finally {
            await deployment.releaseDataDir();
        }
    });

}

export async function buildAndDeploy(options: BuildOptions): Promise<DeployState> {
    debugAction(`buildAndDeploy: start`);
    const initial = await currentState(options);
    const topTask = options.taskObserver;
    const tasks = topTask.childGroup().add({
        compile: "Compiling project",
        build: "Building DOM",
        observe: "Observing environment",
        rebuild: "Rebuilding DOM",
        deploy: "Deploying",
    });
    await immediatePromise();

    const ret = withContext(initial, async (ctx: AdaptContext) => {
        debugAction(`buildAndDeploy: build`);
        const build1 = await tasks.build.complete(() => build({
            ...initial,
            ctx,
            withStatus: false,
            taskObserver: tasks.build
        }));
        const observeOptions = {
            ...build1,
            taskObserver: tasks.observe
        };
        debugAction(`buildAndDeploy: observe`);
        const obs = await tasks.observe.complete(() => observe(observeOptions));
        const { needsData, ...build2Options } = obs;
        debugAction(`buildAndDeploy: build 2`);
        const build2 = await tasks.rebuild.complete(() => build({
            ...build2Options,
            withStatus: true,
            taskObserver: tasks.rebuild
        }));
        debugAction(`buildAndDeploy: deploy`);
        return tasks.deploy.complete(() => deploy({
            ...build2,
            taskObserver: tasks.deploy
        }));
    });
    debugAction(`buildAndDeploy: done`);
    return ret;
}
