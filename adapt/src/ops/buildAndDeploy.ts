import * as path from "path";

import {
    AdaptElementOrNull,
    build,
    Message,
    MessageLogger,
    ProjectBuildError,
    serializeDom,
} from "..";
import { makeObserverManagerDeployment, observe, patchInNewQueries } from "../observers";
import { createPluginManager } from "../plugin_support";
import { reanimateDom } from "../reanimate";
import { Deployment } from "../server/deployment";
import { getStacks, } from "../stack";
import { createStateStore, StateStore } from "../state";
import {
    exec,
    MemFileHost,
} from "../ts";
import { DeployState } from "./common";
import { parseFullObservationsJson, stringifyFullObservations } from "./serialize";

export interface BuildOptions {
    deployment: Deployment;
    dryRun: boolean;
    fileName: string;
    logger: MessageLogger;
    stackName: string;

    observationsJson?: string;
    prevStateJson?: string;
    projectRoot?: string;
}

export async function buildAndDeploy(options: BuildOptions): Promise<DeployState> {
    const { deployment, logger, stackName } = options;

    const prev = await deployment.lastEntry();
    const prevDom = prev ? await reanimateDom(prev.domXml) : null;
    const prevStateJson =
        options.prevStateJson ||
        (prev ? prev.stateJson : "");
    const observations = (() => {
        if (options.observationsJson) return parseFullObservationsJson(options.observationsJson);
        if (prev && prev.observationsJson) return parseFullObservationsJson(prev.observationsJson);
        return {};
    })();

    let observerObservations = observations.observer ? observations.observer : {};
    const history = await deployment.historyWriter();

    const fileName = path.resolve(options.fileName);
    const projectRoot = options.projectRoot || path.dirname(fileName);

    const fileExt = path.extname(fileName);
    const importName = path.basename(fileName, fileExt);

    const host = MemFileHost("/", projectRoot);
    const context = Object.create(null);

    const wrapper = `
        require("source-map-support").install();
        require("./${importName}");
        `;
    const wrapperFileName = path.join(projectRoot, "[wrapper].ts");
    host.writeFile(wrapperFileName, wrapper, false);
    exec([wrapperFileName, fileName], { context, host });

    const stacks = getStacks();
    if (!stacks) throw new Error(`No stacks found`);
    const stack = stacks[stackName];
    if (!stack) throw new Error(`Stack '${stackName}' not found`);

    let stateStore: StateStore;
    try {
        stateStore = createStateStore(prevStateJson);
    } catch (err) {
        let msg = `Invalid previous state JSON`;
        if (err.message) msg += `: ${err.message}`;
        throw new Error(msg);
    }

    let newDom: AdaptElementOrNull = null;
    let buildMessages: Message[] = [];

    if (stack.root != null) {
        const preObserverManager = makeObserverManagerDeployment(observerObservations);

        const preObserve = await build(stack.root, stack.style, { stateStore, observerManager: preObserverManager });
        if (preObserve.messages.length !== 0) {
            logger.append(preObserve.messages);
            throw new ProjectBuildError(serializeDom(preObserve.contents));
        }

        observerObservations = await observe(preObserverManager.executedQueries(), logger);

        const postObserverManager = makeObserverManagerDeployment(observerObservations);
        const postObserve = await build(stack.root, stack.style, { stateStore, observerManager: postObserverManager });
        newDom = postObserve.contents;
        buildMessages = postObserve.messages;
        patchInNewQueries(observerObservations, postObserverManager.executedQueries());
    }

    const domXml = serializeDom(newDom, true);

    if (buildMessages.length !== 0) {
        logger.append(buildMessages);
        throw new ProjectBuildError(domXml);
    }

    const stateJson = stateStore.serialize();

    const mgr = createPluginManager(deployment.pluginConfig);
    await mgr.start(prevDom, newDom, {
        deployID: deployment.deployID,
        logger,
    });
    const newPluginObs = await mgr.observe();
    mgr.analyze();

    /*
     * NOTE: There should be no deployment side effects prior to here, but
     * once act is called, that is no longer true.
     */
    const observationsJson = stringifyFullObservations({
        plugin: newPluginObs,
        observer: observerObservations
    });

    await history.appendEntry({
        domXml,
        stateJson,
        stackName,
        projectRoot,
        fileName,
        observationsJson
    });

    await mgr.act(options.dryRun);
    await mgr.finish();

    return {
        type: "success",
        deployID: deployment.deployID,
        domXml,
        stateJson,
        messages: logger.messages,
        summary: logger.summary,
    };
}
