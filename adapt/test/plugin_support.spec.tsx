import * as fs from "fs-extra";
import * as path from "path";
import * as should from "should";
import * as sinon from "sinon";

import Adapt, { Group, UnbsElement } from "../src";
import * as pluginSupport from "../src/plugin_support";
import { setAdaptContext } from "../src/ts/context";
import { createMockLogger, MockLogger, packageDirs } from "./testlib";

function nextTick(): Promise<void> {
    return new Promise((res) => process.nextTick(() => res()));
}

async function doAction(name: string, cb: (op: string) => void) {
    await nextTick();
    cb(name);
}

class TestPlugin implements pluginSupport.Plugin {
    constructor(readonly spy: sinon.SinonSpy) { }

    async start(options: pluginSupport.PluginOptions) {
        this.spy("start", options);
    }
    async observe(dom: UnbsElement) {
        this.spy("observe", dom);
    }
    analyze(dom: UnbsElement): pluginSupport.Action[] {
        this.spy("analyze", dom);
        return [
            { description: "action1", act: () => doAction("action1", this.spy) },
            { description: "action2", act: () => doAction("action2", this.spy) }
        ];
    }
    async finish() {
        this.spy("finish");
    }
}

describe("Plugin Support Basic Tests", () => {
    let mgr: pluginSupport.PluginManager;
    let spy: sinon.SinonSpy;
    let logger: MockLogger;
    const dom = <Group />;

    beforeEach(() => {
        spy = sinon.spy();
        logger = createMockLogger();

        mgr = pluginSupport.createPluginManager({
            plugins: [new TestPlugin(spy)]
        });
    });

    it("Should construct a PluginManager", () => {
        should(mgr).not.Undefined();
    });

    it("Should call start on each plugin", async () => {
        await mgr.start(dom, { log: logger.log });
        should(spy.calledOnce).True();
        should(spy.args[0][0]).equal("start");
    });

    it("Should call observe after start", async () => {
        await mgr.start(dom, { log: logger.log });
        await mgr.observe();
        should(spy.callCount).equal(2);
        should(spy.getCall(0).args[0]).equal("start");
        should(spy.getCall(1).args).eql(["observe", dom]);
    });

    it("Should call analyze after observe", async () => {
        await mgr.start(dom, { log: logger.log });
        await mgr.observe();
        await mgr.analyze();
        should(spy.callCount).equal(3);
        should(spy.getCall(0).args[0]).equal("start");
        should(spy.getCall(1).args).eql(["observe", dom]);
        should(spy.getCall(2).args).eql(["analyze", dom]);
    });

    it("Should call actions", async () => {
        await mgr.start(dom, { log: logger.log });
        await mgr.observe();
        await mgr.analyze();
        await mgr.act(false);
        await mgr.finish();
        should(spy.callCount).equal(6);
        should(spy.getCall(0).args[0]).equal("start");
        should(spy.getCall(1).args).eql(["observe", dom]);
        should(spy.getCall(2).args).eql(["analyze", dom]);
        should(spy.getCall(3).args).eql(["action1"]);
        should(spy.getCall(4).args).eql(["action2"]);
        should(spy.getCall(5).args).eql(["finish"]);
        const contents = logger.stdout;
        should(contents).match(/action1/);
        should(contents).match(/action2/);
    });

    it("Should not call actions on dry run", async () => {
        await mgr.start(dom, { log: logger.log });
        await mgr.observe();
        await mgr.analyze();
        await mgr.act(true);
        await mgr.finish();
        should(spy.callCount).equal(4);
        should(spy.getCall(0).args[0]).equal("start");
        should(spy.getCall(1).args).eql(["observe", dom]);
        should(spy.getCall(2).args).eql(["analyze", dom]);
        should(spy.getCall(3).args).eql(["finish"]);
        const contents = logger.stdout;
        should(contents).match(/action1/);
        should(contents).match(/action2/);
    });

    it("Should not allow illegal call sequences", async () => {
        await mgr.start(dom, { log: logger.log });
        should(() => mgr.analyze()).throw();
        await should(mgr.act(false)).rejectedWith(Error);
        await should(mgr.finish()).rejectedWith(Error);

        await mgr.observe();
        await should(mgr.act(false)).rejectedWith(Error);
        await should(mgr.finish()).rejectedWith(Error);

        await mgr.analyze();
        await mgr.act(true); //dry run
        await mgr.act(false);
        await mgr.finish();
    });

    it("Should allow finish without acting", async () => {
        await mgr.start(dom, { log: logger.log });
        await mgr.observe();
        await mgr.analyze();
        await mgr.finish();
    });
});

let testPluginsLoaded: string[] = [];

function testPluginSrcDir(name: string) {
    return path.join(packageDirs.root, "test_plugins", name);
}

async function setupTestPlugin(name: string) {
    const srcDir = testPluginSrcDir(name);
    const modDir = path.join(packageDirs.dist, "test_plugins", name);
    await fs.ensureSymlink(
        path.join(srcDir, "package.json"), path.join(modDir, "package.json"));
    return modDir;
}

async function requireTestPlugin(name: string, jsFile = "index.js") {
    const modDir = await setupTestPlugin(name);
    const jsPath = path.resolve(path.join(modDir, jsFile));
    await require(jsPath);
    testPluginsLoaded.push(jsPath);
}

function cleanupTestPlugins() {
    for (const p of testPluginsLoaded) {
        delete require.cache[p];
    }
    testPluginsLoaded = [];
}

describe("Plugin register and deploy", () => {
    let logger: MockLogger;
    const dom = <Group />;

    beforeEach(() => {
        cleanupTestPlugins();
        setAdaptContext(Object.create(null));
        logger = createMockLogger();
    });

    after(() => {
        cleanupTestPlugins();
        setAdaptContext(Object.create(null));
    });

    it("Should register plugin", async () => {
        await requireTestPlugin("echo_plugin");
        const config = pluginSupport.createPluginConfig();
        config.plugins.should.have.length(1);

        const mgr = pluginSupport.createPluginManager(config);
        await mgr.start(dom, { log: logger.log });
        const stdout = logger.stdout;
        should(stdout).match(/EchoPlugin: start/);
    });

    it("Should error if no plugins registered", () => {
        should(() => pluginSupport.createPluginConfig()).throw(/No plugins registered/);
    });

    it("Should throw on registering same plugin twice", async () => {
        await requireTestPlugin("echo_plugin");
        return should(requireTestPlugin("echo_plugin", "second.js"))
            .be.rejectedWith(/Attempt to register multiple plugins with the same name 'echo_plugin'/);
    });
});
