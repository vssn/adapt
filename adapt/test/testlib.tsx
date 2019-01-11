import { findPackageDirs } from "@usys/utils";
import should from "should";
import Adapt, { AdaptElement, build, buildPrinter, StateStore } from "../src";
import * as jsx from "../src/jsx";

import { makeObserverManagerDeployment } from "../src/observers";

export const packageDirs = findPackageDirs(__dirname);
export const pkgRootDir = packageDirs.root;
export const pkgTestDir = packageDirs.test;

export function checkChildComponents(element: Adapt.AdaptElement, ...children: any[]) {
    const childArray = jsx.childrenToArray(element.props.children);

    const childComponents = childArray.map(
        (child: any) => {
            if (Adapt.isElement(child)) {
                return child.componentType;
            } else {
                return undefined;
            }
        }
    );

    should(childComponents).eql(children);
}

export class Empty extends Adapt.PrimitiveComponent<{ id: number }> { }

export function MakeMakeEmpty(props: { id: number }) {
    return <MakeEmpty id={props.id} />;
}

export function MakeEmpty(props: { id: number }) {
    return <Empty id={props.id} />;
}

export function MakeGroup(props: { children?: Adapt.AdaptElement[] | Adapt.AdaptElement }) {
    return <Adapt.Group>{props.children}</Adapt.Group>;
}

export interface WithDefaultsProps {
    prop1: number;
    prop2: number;
}
export class WithDefaults extends Adapt.Component<WithDefaultsProps> {
    static defaultProps = {
        prop1: 100,
        prop2: 200,
    };

    build() {
        return (
            <Adapt.Group>
                <Empty key="1" id={this.props.prop1!} />
                <Empty key="2" id={this.props.prop2!} />
            </Adapt.Group>
        );
    }
}

export { deepFilterElemsToPublic } from "../src";

// Constructor data that doesn't actually keep track of state
const noStoreConstructorData: jsx.ComponentConstructorData = {
    getState: () => ({}),
    setInitialState: () => {/**/ },
    observerManager: makeObserverManagerDeployment({}) //Just a placeholder value, observers may not yet be registered
};

export function componentConstructorDataFixture(ccData = noStoreConstructorData) {
    ccData.observerManager =
        makeObserverManagerDeployment({}); //Make sure we call after registerObserver from modules are done
    before(() => jsx.pushComponentConstructorData(ccData));
    after(() => jsx.popComponentConstructorData());
}

export interface DoBuildOpts {
    deployID?: string;
    stateStore?: StateStore;
    debug?: boolean;
    style?: AdaptElement | null;
}

const doBuildDefaults = {
    deployID: "<none>",
    debug: false,
    style: null,
};

export async function doBuild(elem: AdaptElement, options: DoBuildOpts = {}) {
    const { deployID, stateStore, debug, style } = { ...doBuildDefaults, ...options };
    const buildOpts = {
        recorder: debug ? buildPrinter() : undefined,
        deployID,
        stateStore,
    };
    const { mountedOrig, contents: dom, messages } = await build(elem, style, buildOpts);
    if (dom == null) {
        should(dom).not.Null();
        should(dom).not.Undefined();
        throw new Error("Unreachable");
    }

    should(messages).have.length(0);
    return { mountedOrig, dom };
}
