import * as util from "util";

import * as ld from "lodash";

import * as css from "./css";

import {
    AdaptComponentElement,
    AdaptElement,
    AdaptElementImpl,
    AdaptElementOrNull,
    AdaptMountedElement,
    AnyProps,
    BuildHelpers,
    childrenToArray,
    cloneElement,
    Component,
    createElement,
    FunctionComponentTyp,
    isComponentElement,
    isDeferredElementImpl,
    isElement,
    isElementImpl,
    isMountedElement,
    isMountedPrimitiveElement,
    isPrimitiveElement,
    KeyPath,
    popComponentConstructorData,
    pushComponentConstructorData,
    simplifyChildren,
    WithChildren,
} from "./jsx";

import {
    createStateStore, StateNamespace, stateNamespaceForPath, StateStore
} from "./state";

import {
    createObserverManagerDeployment, isObserverNeedsData, ObserverManagerDeployment
} from "./observers";

import { Message, MessageType, removeUndef } from "@usys/utils";
import { OmitT, WithPartialT } from "type-ops";
import { DomError, isDomErrorElement } from "./builtin_components";
import {
    BuildListener,
    BuildOp,
} from "./dom_build_data_recorder";
import { BuildNotImplemented, InternalError, isError, ThrewNonError } from "./error";
import { getInternalHandle, Handle } from "./handle";
import { finishHooks, startHooks } from "./hooks";
import { assignKeysAtPlacement, computeMountKey, ElementKey } from "./keys";

export type DomPath = AdaptElement[];

type CleanupFunc = () => void;
class BuildResults {
    // These reset each build pass
    mountedOrig: AdaptMountedElement | null;
    contents: AdaptElementOrNull;
    cleanups: CleanupFunc[];
    mountedElements: AdaptElement[];
    builtElements: AdaptElement[];
    stateChanged: boolean;

    // These accumulate across build passes
    buildErr = false;
    buildPassStarts = 0;
    private messages: Message[] = [];

    constructor(
        readonly recorder: BuildListener,
        mountedOrig?: AdaptMountedElement | null,
        contents?: AdaptElementOrNull,
        other?: BuildResults) {

        this.buildPassReset();

        if (contents !== undefined) {
            this.contents = contents;
        }

        if (mountedOrig !== undefined) {
            this.mountedOrig = mountedOrig;
        }

        if (other !== undefined) {
            this.combine(other);
        }
    }

    buildPassReset() {
        this.mountedOrig = null;
        this.contents = null;
        this.cleanups = [];
        this.mountedElements = [];
        this.builtElements = [];
        this.stateChanged = false;
    }

    // Terminology is a little confusing here. Anything that allows the
    // build to keep progressing should be MessageType.warning.
    // MessageType.error should only be for catastrophic things where
    // the build cannot keep running (i.e. an exception that can't be
    // handled within build).
    // However, either MessageType.warning or MessageType.error indicates
    // an unsuccessful build, therefore buildErr = true.

    /**
     * Record an error in build data recorder and log a message and mark
     * the build as errored.
     * This is the primary interface for most build errors.
     */
    error(err: string | Error, from?: string) {
        const error = ld.isError(err) ? err : new Error(err);
        this.recorder({ type: "error", error });

        this.message({ type: MessageType.warning, from }, error);
    }

    /**
     * Lower-level message log interface. Does not record to build data
     * recorder, but does mark build as errored, depending on MessageType.
     */
    message(msg: WithPartialT<Message, "from" | "timestamp">): void;
    message(msg: WithPartialT<OmitT<Message, "content">, "from" | "timestamp">, err: Error): void;
    message(msg: WithPartialT<Message, "from" | "timestamp" | "content">, err?: Error): void {
        const content = err ? err.message : msg.content;
        if (!content) throw new InternalError(`build message doesn't have content or err`);

        const copy = {
            ...msg,
            content,
            timestamp: msg.timestamp ? msg.timestamp : Date.now(),
            from: msg.from ? msg.from : "DOM build",
        };
        this.messages.push(copy);

        switch (copy.type) {
            case MessageType.warning:
            case MessageType.error:
                this.buildErr = true;
        }
    }

    combine(other: BuildResults): BuildResults {
        this.messages.push(...other.messages);
        this.cleanups.push(...other.cleanups);
        this.mountedElements.push(...other.mountedElements);
        this.builtElements.push(...other.builtElements);
        this.buildErr = this.buildErr || other.buildErr;
        this.stateChanged = this.stateChanged || other.stateChanged;
        this.buildPassStarts += other.buildPassStarts;
        other.messages = [];
        other.cleanups = [];
        other.builtElements = [];
        other.mountedElements = [];
        other.buildPassStarts = 0;
        return this;
    }
    cleanup() {
        let clean: CleanupFunc | undefined;
        do {
            clean = this.cleanups.pop();
            if (clean) clean();
        } while (clean);
    }
    toBuildOutput(): BuildOutput {
        if (this.buildErr && this.messages.length === 0) {
            throw new InternalError(`buildErr is true, but there are ` +
                `no messages to describe why`);
        }
        if (this.contents != null) {
            if (!isMountedElement(this.contents)) {
                throw new InternalError(`contents is not a mounted element: ${this.contents}`);
            }
        }
        return {
            messages: this.messages,
            contents: this.contents,
            mountedOrig: this.mountedOrig
        };
    }
}

function isClassConstructorError(err: any) {
    return err instanceof TypeError && typeof err.message === "string" &&
        /Class constructor .* cannot be invoked/.test(err.message);
}

function recordDomError(
    cc: BuildResults,
    element: AdaptElement,
    err: Error | Message,
): { domError: AdaptElement<{}>, message: string } {
    let message: string;

    if (ld.isError(err)) {
        message = `Component ${element.componentName} cannot be built ` +
            `with current props` + (err.message ? ": " + err.message : "");
        cc.error(message);
    } else {
        message = err.content;
        cc.message(err);
    }
    const domError = createElement(DomError, {}, message);

    const kids = childrenToArray(element.props.children);
    kids.unshift(domError);
    replaceChildren(element, kids);

    return { domError, message };
}

function buildHelpers(options: BuildOptionsInternal): BuildHelpers {
    return {
        async elementStatus(handle: Handle) {
            const elem = handle.mountedOrig;
            if (elem == null) return { noStatus: true };
            if (!isElementImpl(elem)) throw new InternalError("Element is not ElementImpl");
            try {
                return await elem.statusWithMgr(options.observerManager);
            } catch (e) {
                if (!isObserverNeedsData(e)) throw e;
                return undefined;
            }
        },
        deployID: options.deployID
    };
}

async function computeContentsFromElement<P extends object>(
    element: AdaptMountedElement<P & WithChildren>,
    options: BuildOptionsInternal): Promise<BuildResults> {
    const ret = new BuildResults(options.recorder, element);

    try {
        startHooks({ element, options });
        ret.contents =
            (element.componentType as FunctionComponentTyp<P>)(element.props);
        return ret;
    } catch (e) {
        if (e instanceof BuildNotImplemented) return buildDone(e);
        if (!isClassConstructorError(e)) throw e;
        // element.componentType is a class, not a function. Fall through.
    } finally {
        finishHooks();
    }

    if (!isComponentElement(element)) {
        throw new InternalError(`trying to construct non-component`);
    }
    let component: Component;
    try {
        component = constructComponent(element, options.stateStore, options.observerManager);
    } catch (e) {
        if (e instanceof BuildNotImplemented) return buildDone(e);
        if (isError(e)) {
            return buildDone(new Error(`Component construction failed: ${e.message}`));
        }
        throw e;
    }

    try {
        if (!ld.isFunction(component.build)) {
            throw new BuildNotImplemented(`build is not a function, build = ${util.inspect(component.build)}`);
        }
        ret.contents = await component.build(buildHelpers(options));
        if (component.cleanup) {
            ret.cleanups.push(component.cleanup.bind(component));
        }
        return ret;

    } catch (e) {
        if (e instanceof BuildNotImplemented) return buildDone(e);
        throw e;
    }

    function buildDone(err?: Error) {
        ret.contents = element;
        if (err) recordDomError(ret, element, err);
        return ret;
    }
}

function findOverride(styles: css.StyleList, path: DomPath, options: BuildOptionsInternal) {
    const element = path[path.length - 1];
    const reg = options.matchInfoReg;

    for (const style of styles.reverse()) {
        if (css.canMatch(reg, element) &&
            !css.ruleHasMatched(reg, element, style) &&
            style.match(path)) {

            css.ruleMatches(reg, element, style);
            return { style, override: style.sfc };
        }
    }
    return null;
}

async function computeContents(
    path: DomPath,
    options: BuildOptionsInternal): Promise<BuildResults> {

    const element = ld.last(path);
    if (element == null) {
        const ret = new BuildResults(options.recorder);
        return ret;
    }
    if (!isMountedElement(element)) throw new InternalError(`computeContents for umounted element: ${element}`);

    const hand = getInternalHandle(element);

    const out = await computeContentsFromElement(element, options);

    // Default behavior if the component doesn't explicitly call
    // handle.replaceTarget is to do the replace for them.
    if (!hand.targetReplaced) hand.replaceTarget(out.contents);

    options.recorder({
        type: "step",
        oldElem: element,
        newElem: out.contents
    });

    return out;
}

function ApplyStyle(
    props: {
        override: css.BuildOverride<AnyProps>,
        element: AdaptElement,
        matchInfoReg: css.MatchInfoReg,
    }) {

    const origBuild = () => {
        return props.element;
    };

    const hand = getInternalHandle(props.element);
    const ret = props.override(props.element.props, {
        origBuild,
        origElement: props.element,
        [css.$matchInfoReg]: props.matchInfoReg,
    });

    // Default behavior if they don't explicitly call
    // handle.replaceTarget is to do the replace for them.
    if (!hand.targetReplaced) hand.replaceTarget(ret);

    return ret;
}

function doOverride(
    path: DomPath,
    key: ElementKey,
    styles: css.StyleList,
    options: BuildOptionsInternal): AdaptElement {

    let element = ld.last(path);
    if (element == null) {
        throw new Error("Cannot match null element to style rules for empty path");
    }

    const overrideFound = findOverride(styles, path, options);

    if (overrideFound != null) {
        const matchInfoReg = options.matchInfoReg;
        if (isComponentElement(element)) {
            if (!isMountedElement(element)) throw new InternalError(`Element should be mounted`);
            if (!isElementImpl(element)) throw new InternalError(`Element should be ElementImpl`);
            if (element.component == null) {
                element.component = constructComponent(element,
                    options.stateStore, options.observerManager);
            }
        }
        const hand = getInternalHandle(element);
        const oldEl = element;
        element = cloneElement(element, key, element.props.children);
        css.copyRuleMatches(matchInfoReg, oldEl, element);
        hand.replaceTarget(element);
        const { style, override } = overrideFound;
        const props = { ...key, override, element, matchInfoReg };
        const newElem = createElement(ApplyStyle, props);
        // The ApplyStyle element should never match any CSS rule
        css.neverMatch(matchInfoReg, newElem);

        options.recorder({
            type: "step",
            oldElem: element,
            newElem,
            style
        });
        return newElem;
    } else {
        return element;
    }
}

function mountElement(
    path: DomPath,
    parentStateNamespace: StateNamespace,
    options: BuildOptionsInternal): BuildResults {

    let elem = ld.last(path);
    if (elem === undefined) {
        throw new InternalError("Attempt to mount empty path");
    }

    if (elem === null) return new BuildResults(options.recorder, elem, elem);

    if (isMountedElement(elem)) {
        throw new Error("Attempt to remount element: " + util.inspect(elem));
    }

    const newKey = computeMountKey(elem, parentStateNamespace);
    const hand = getInternalHandle(elem);
    const oldEl = elem;
    elem = cloneElement(elem, newKey, elem.props.children);
    css.copyRuleMatches(options.matchInfoReg, oldEl, elem);
    if (!hand.targetReplaced) hand.replaceTarget(elem);

    if (!isElementImpl(elem)) {
        throw new Error("Elements must derive from ElementImpl");
    }

    const finalPath = subLastPathElem(path, elem);
    elem.mount(parentStateNamespace, domPathToString(finalPath),
        domPathToKeyPath(finalPath));
    if (!isMountedElement(elem)) throw new InternalError(`just mounted element is not mounted ${elem}`);
    const out = new BuildResults(options.recorder, elem, elem);
    out.mountedElements.push(elem);
    elem.buildData.deployID = options.deployID;
    return out;
}

function subLastPathElem(path: DomPath, elem: AdaptElement): DomPath {
    const ret = path.slice(0, -1);
    ret.push(elem);
    return ret;
}

async function buildElement(
    path: DomPath,
    parentStateNamespace: StateNamespace,
    styles: css.StyleList,
    options: BuildOptionsInternal): Promise<BuildResults> {

    const elem = ld.last(path);
    if (elem === undefined) {
        throw new InternalError("buildElement called with empty path");
    }

    if (elem === null) return new BuildResults(options.recorder, null, null);

    if (!isMountedElement(elem)) throw new InternalError(`attempt to build unmounted element ${elem}`);
    if (!isElementImpl(elem)) throw new Error(`Elements must derive from ElementImpl ${elem}`);

    const override = doOverride(path, computeMountKey(elem, parentStateNamespace), styles, options);
    if (override !== elem) {
        return new BuildResults(options.recorder, elem, override);
    }

    if (isPrimitiveElement(elem)) {
        const res = new BuildResults(options.recorder, elem, elem);
        try {
            constructComponent(elem, options.stateStore, options.observerManager);
            res.builtElements.push(elem);
        } catch (err) {
            if (!isError(err)) throw err;
            recordDomError(res, elem,
                new Error(`Component construction failed: ${err.message}`));
        }
        return res;
    }

    const out = await computeContents(path, options);

    if (out.contents != null) {
        if (Array.isArray(out.contents)) {
            const name = elem.componentName;
            throw new Error(`Component build for ${name} returned an ` +
                `array. Components must return a single root element when ` +
                `built.`);
        }
    }

    out.builtElements.push(elem);
    return out;
}

function constructComponent<P extends object = {}>(
    elem: AdaptComponentElement<P>, stateStore: StateStore, observerManager: ObserverManagerDeployment): Component<P> {

    if (!isElementImpl(elem)) {
        throw new InternalError(`Element is not an ElementImpl`);
    }

    pushComponentConstructorData({
        getState: () => stateStore.elementState(elem.stateNamespace),
        setInitialState: (init) => stateStore.setElementState(elem.stateNamespace, init),
        observerManager
    });

    try {
        const component = new elem.componentType(elem.props);
        elem.component = component;
        return component;
    } finally {
        popComponentConstructorData();
    }
}

function notNull(x: any): boolean {
    return x != null;
}

export interface BuildOptions {
    depth?: number;
    shallow?: boolean;
    recorder?: BuildListener;
    stateStore?: StateStore;
    observerManager?: ObserverManagerDeployment;
    maxBuildPasses?: number;
    buildOnce?: boolean;
    deployID?: string;
}

export interface BuildOptionsInternal extends Required<BuildOptions> {
    matchInfoReg: css.MatchInfoReg;
}

function computeOptions(optionsIn?: BuildOptions): BuildOptionsInternal {
    if (optionsIn != null) optionsIn = removeUndef(optionsIn);
    const defaultBuildOptions = {
        depth: -1,
        shallow: false,
        // Next line shouldn't be needed.  VSCode tslint is ok, CLI is not.
        // tslint:disable-next-line:object-literal-sort-keys
        recorder: (_op: BuildOp) => { return; },
        stateStore: createStateStore(),
        observerManager: createObserverManagerDeployment(),
        maxBuildPasses: 200,
        buildOnce: false,
        deployID: "<none>"
    };
    return { ...defaultBuildOptions, ...optionsIn, matchInfoReg: css.createMatchInfoReg() };
}

let buildCount = 0;

export interface BuildOutput {
    mountedOrig: AdaptMountedElement | null;
    contents: AdaptMountedElement | null;
    messages: Message[];
}
export async function build(
    root: AdaptElement,
    styles: AdaptElementOrNull,
    options?: BuildOptions): Promise<BuildOutput> {

    if (buildCount !== 0) {
        throw new InternalError(`Attempt to build multiple DOMs concurrently not supported`);
    }
    try {
        buildCount++;

        const optionsReq = computeOptions(options);
        const results = new BuildResults(optionsReq.recorder);
        const styleList = css.buildStyles(styles);

        if (optionsReq.depth === 0) throw new Error(`build depth cannot be 0: ${options}`);

        await pathBuild([root], styleList, optionsReq, results);
        return results.toBuildOutput();
    } finally {
        buildCount--;
    }
}

export async function buildOnce(
    root: AdaptElement,
    styles: AdaptElement | null,
    options?: BuildOptions): Promise<BuildOutput> {

    return build(root, styles, { ...options, buildOnce: true });
}

function atDepth(options: BuildOptionsInternal, depth: number) {
    if (options.shallow) return true;
    if (options.depth === -1) return false;
    return depth >= options.depth;
}

async function nextTick(): Promise<void> {
    await new Promise((res) => {
        process.nextTick(res);
    });
}

async function pathBuild(
    path: DomPath,
    styles: css.StyleList,
    options: BuildOptionsInternal,
    results: BuildResults): Promise<void> {

    options.matchInfoReg = css.createMatchInfoReg();
    await pathBuildOnceGuts(path, styles, options, results);
    if (results.buildErr || options.buildOnce) return;
    if (results.stateChanged) {
        await nextTick();
        return pathBuild(path, styles, options, results);
    }
}

async function pathBuildOnceGuts(
    path: DomPath,
    styles: css.StyleList,
    options: BuildOptionsInternal,
    results: BuildResults): Promise<void> {

    const root = path[path.length - 1];

    if (results.buildPassStarts++ > options.maxBuildPasses) {
        results.error(`DOM build exceeded maximum number of build iterations ` +
            `(${options.maxBuildPasses})`);
        return;
    }

    options.recorder({ type: "start", root });
    results.buildPassReset();

    try {
        const once = await realBuildOnce(path, null, styles, options, null);
        once.cleanup();
        results.combine(once);
        results.mountedOrig = once.mountedOrig;
        results.contents = once.contents;
    } catch (error) {
        options.recorder({ type: "error", error });
        throw error;
    }

    if (results.buildErr) return;

    results.builtElements.map((elem) => {
        if (isMountedPrimitiveElement(elem)) {
            let msgs: (Message | Error)[];
            try {
                msgs = elem.validate();
            } catch (err) {
                if (!ld.isError(err)) err = new ThrewNonError(err);
                msgs = [err];
            }
            for (const m of msgs) recordDomError(results, elem, m);
        }
    });

    if (results.buildErr) return;

    options.recorder({ type: "done", root: results.contents });
    const updates = results.builtElements.map(async (elem) => {
        if (isElementImpl(elem)) {
            const { stateChanged } = await elem.postBuild(options.stateStore);
            if (stateChanged) {
                results.stateChanged = true;
            }
        }
    });
    await Promise.all(updates);
}

function setOrigChildren(predecessor: AdaptElementImpl<AnyProps>, origChildren: any[]) {
    predecessor.buildData.origChildren = origChildren;
}

async function buildChildren(
    newRoot: AdaptElement,
    workingPath: DomPath,
    styles: css.StyleList,
    options: BuildOptionsInternal): Promise<{ newChildren: any, childBldResults: BuildResults }> {

    if (!isElementImpl(newRoot)) throw new Error(`Elements must inherit from ElementImpl ${util.inspect(newRoot)}`);

    const out = new BuildResults(options.recorder);

    const children = newRoot.props.children;
    let newChildren: any = null;
    if (children == null) {
        return { newChildren: null, childBldResults: out };
    }

    //FIXME(manishv) Make this use an explicit stack
    //instead of recursion to avoid blowing the call stack
    //For deep DOMs
    let childList: any[] = [];
    if (isElement(children)) {
        childList = [children];
    } else if (ld.isArray(children)) {
        childList = children;
    }

    assignKeysAtPlacement(childList);
    newChildren = [];
    const mountedOrigChildren: any[] = [];
    for (const child of childList) {
        if (isMountedElement(child)) {
            newChildren.push(child); //Must be from a deferred build
            mountedOrigChildren.push(child);
            continue;
        }
        if (isElementImpl(child)) {
            options.recorder({ type: "descend", descendFrom: newRoot, descendTo: child });
            const ret = await realBuildOnce(
                [...workingPath, child],
                newRoot.stateNamespace,
                styles,
                options,
                null,
                child);
            options.recorder({ type: "ascend", ascendTo: newRoot, ascendFrom: child });
            ret.cleanup(); // Do lower level cleanups before combining msgs
            out.combine(ret);
            newChildren.push(ret.contents);
            mountedOrigChildren.push(ret.mountedOrig);
            continue;
        } else {
            newChildren.push(child);
            mountedOrigChildren.push(child);
            continue;
        }
    }

    setOrigChildren(newRoot, mountedOrigChildren);
    newChildren = newChildren.filter(notNull);
    return { newChildren, childBldResults: out };
}

export interface BuildData {
    id: string;
    deployID: string;
    successor?: AdaptMountedElement | null;
    //Only defined for deferred elements since other elements may never mount their children
    origChildren?: (AdaptMountedElement | null | unknown)[];
}

function setSuccessor(predecessor: AdaptMountedElement | null, succ: AdaptMountedElement | null): void {
    if (predecessor === null) return;
    if (!isElementImpl(predecessor)) throw new InternalError(`Element is not ElementImpl: ${predecessor}`);
    predecessor.buildData.successor = succ;
}

async function realBuildOnce(
    pathIn: DomPath,
    parentStateNamespace: StateNamespace | null,
    styles: css.StyleList,
    options: BuildOptionsInternal,
    predecessor: AdaptMountedElement | null,
    workingElem?: AdaptElement): Promise<BuildResults> {

    let deferring = false;
    const atDepthFlag = atDepth(options, pathIn.length);

    if (options.depth === 0) throw new InternalError("build depth 0 not supported");

    if (parentStateNamespace == null) {
        parentStateNamespace = stateNamespaceForPath(pathIn.slice(0, -1));
    }

    const oldElem = ld.last(pathIn);
    if (oldElem === undefined) throw new InternalError("realBuild called with empty path");
    if (oldElem === null) return new BuildResults(options.recorder, null);
    if (workingElem === undefined) {
        workingElem = oldElem;
    }

    const out = new BuildResults(options.recorder);
    let mountedElem: AdaptElementOrNull = oldElem;
    if (!isMountedElement(oldElem)) {
        const mountOut = mountElement(pathIn, parentStateNamespace, options);
        if (mountOut.buildErr) return mountOut;
        out.contents = mountedElem = mountOut.contents;
        out.combine(mountOut);
    }
    if (!isMountedElement(mountedElem)) throw new InternalError("element not mounted after mount");
    out.mountedOrig = mountedElem;
    setSuccessor(predecessor, mountedElem);

    if (mountedElem === null) {
        options.recorder({ type: "elementBuilt", oldElem: workingElem, newElem: out.contents });
        return out;
    }

    //Element is mounted
    const mountedPath = subLastPathElem(pathIn, mountedElem);

    let newRoot: AdaptElementOrNull | undefined;
    let newPath = mountedPath;
    if (!isElementImpl(mountedElem)) {
        throw new Error("Elements must inherit from ElementImpl:" + util.inspect(newRoot));
    }

    if (!isDeferredElementImpl(mountedElem) || mountedElem.shouldBuild()) {
        const computeOut = await buildElement(mountedPath, parentStateNamespace, styles, options);
        out.combine(computeOut);
        out.contents = newRoot = computeOut.contents;

        if (computeOut.buildErr) return out;
        if (newRoot !== null) {
            if (newRoot !== mountedElem) {
                newPath = subLastPathElem(mountedPath, newRoot);
                const ret = (await realBuildOnce(
                    newPath,
                    mountedElem.stateNamespace,
                    styles,
                    options,
                    mountedElem,
                    workingElem)).combine(out);
                ret.mountedOrig = out.mountedOrig;
                return ret;
            } else {
                options.recorder({ type: "elementBuilt", oldElem: workingElem, newElem: newRoot });
                return out;
            }
        }
    } else {
        deferring = true;
        mountedElem.deferred();
        newRoot = mountedElem;
        out.contents = newRoot;
    }

    if (newRoot === undefined) {
        out.error(`Root element undefined after build`);
        out.contents = null;
        return out;
    }
    if (newRoot === null) {
        setSuccessor(mountedElem, newRoot);
        options.recorder({ type: "elementBuilt", oldElem: workingElem, newElem: null });
        return out;
    }

    //Do not process children of DomError nodes in case they result in more DomError children
    if (!isDomErrorElement(newRoot)) {
        if (!atDepthFlag) {
            const { newChildren, childBldResults } = await buildChildren(newRoot, mountedPath, styles, options);
            out.combine(childBldResults);

            replaceChildren(newRoot, newChildren);
        }
    } else {
        if (!out.buildErr) {
            // This could happen if a user instantiates a DomError element.
            // Treat that as a build error too.
            out.error("User-created DomError component present in the DOM tree");
        }
    }

    //We are here either because mountedElem was deferred, or because mountedElem === newRoot
    if (!deferring || atDepthFlag) {
        options.recorder({ type: "elementBuilt", oldElem: workingElem, newElem: newRoot });
        return out;
    }

    //FIXME(manishv)? Should this check be if there were no element children instead of just no children?
    //No built event in this case since we've exited early
    if (atDepthFlag && newRoot.props.children === undefined) return out;

    //We must have deferred to get here
    const deferredRet =
        (await realBuildOnce(
            newPath,
            mountedElem.stateNamespace,
            styles,
            options,
            predecessor,
            workingElem)).combine(out);
    deferredRet.mountedOrig = out.mountedOrig;
    return deferredRet;
}

function replaceChildren(elem: AdaptElement, children: any | any[] | undefined) {
    children = simplifyChildren(children);

    if (Object.isFrozen(elem.props)) {
        const childMerge = (children == null) ? undefined : { children };
        (elem as any).props = {
            ...elem.props,
            ...childMerge
        };
        Object.freeze(elem.props);
    } else {
        if (children == null) {
            delete elem.props.children;
        } else {
            elem.props.children = children;
        }
    }
}

export function domPathToString(domPath: DomPath): string {
    return "/" + domPath.map((el) => el.componentType.name).join("/");
}

function domPathToKeyPath(domPath: DomPath): KeyPath {
    return domPath.map((el) => {
        const key = el.props.key;
        if (typeof key !== "string") {
            throw new InternalError(`element has no key`);
        }
        return key;
    });
}
