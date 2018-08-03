import { npm } from "@usys/utils";
import callsites = require("callsites");
import * as stringify from "json-stable-stringify";
import * as path from "path";
import { findPackageInfo } from "../packageinfo";

// As long as utilsTypes is not used as a value, TS will only pull in the
// types. Then dynamically load utils, if available. Since we use this file
// as a module in unit tests, the dynamic import allows us to not have to
// load all the dependencies that utils needs, thus speeding up tests.
import * as utilsTypes from "../utils";
let trace: typeof utilsTypes.trace;
try {
    // tslint:disable-next-line:no-var-requires
    const utilsMod: typeof utilsTypes = require("../utils");
    trace = utilsMod.trace;
} catch {
    // No tracing if utils is unavailable (e.g. in certain unit tests).
    trace = () => undefined;
}

const debugReanimate = false;
const debugPackageRegistry = false;

export type MummyJson = string;

// Exported for testing only
export class MummyRegistry {
    jsonToObj = new Map<MummyJson, any>();
    objToJson = new Map<any, MummyJson>();

    async awaken(mummyJson: MummyJson): Promise<any> {
        let obj = this.jsonToObj.get(mummyJson);
        if (obj !== undefined) return obj;

        const mummy = JSON.parse(mummyJson);
        if (!isMummy(mummy)) throw new Error(`Invalid mummy JSON`);

        let pkgPath = await packagePath(mummy);
        if (pkgPath == null) {
            // We can't find an EXACT match for the package ID from mummy
            // (package name and exact version). This typically happens for
            // two reasons: 1) The version of the package in question has
            // changed (e.g. updated to newer version) or 2) the package
            // is located in a node search path, but is not in the node_modules
            // directory for THIS package (e.g. it's in a parent node_modules
            // directory like happens in the adapt repo).
            // Both of these things could be fixed by webpacking/zipping the
            // current Adapt project and all dependencies.
            trace(debugReanimate, `WARN: Unable to find package ${packageId(mummy)} in module tree`);
            pkgPath = mummy.pkgName;
        }

        const mainFile = require.resolve(pkgPath);
        const modPath = path.join(path.dirname(mainFile), mummy.relFilePath);

        // This should cause the module to initialize and call registerObject.
        const exp = require(modPath);

        // Try the lookup again
        obj = this.jsonToObj.get(mummyJson);
        if (obj !== undefined) return obj;

        // We get here if the call to registerObject is not done at the top
        // level module scope. We can still find the object we're looking for
        // as long as it gets exported and that export happens at the top
        // level module scope.
        trace(debugReanimate, `\n****  Searching exports for:`, mummy, `\nExports:`, exp);
        this.print();

        let parent: any = exp;
        if (mummy.namespace !== "") parent = parent && parent[mummy.namespace];
        obj = parent && parent[mummy.name];
        trace(debugReanimate, `Exports lookup returned:`, obj);

        // NOTE(mark): I think we can remove namespace, as long as this error
        // never triggers.
        if (mummy.namespace !== "" && obj != null) {
            throw new Error(`**** Used non-default namespace to successfully find ${mummyJson}`);
        }

        if (obj === undefined) {
            throw new Error(`Unable to reanimate ${mummyJson}`);
        }
        this.entomb(obj, mummyJson);
        return obj;
    }

    findMummy(obj: any): MummyJson {
        if (obj == null) throw new Error(`Can't get JSON representation of ${obj}`);
        const mj = this.objToJson.get(obj);
        if (mj !== undefined) return mj;
        throw new Error(`Unable to look up JSON representation for '${obj}'`);
    }

    entomb(obj: any, mummyJson: MummyJson) {
        if (obj == null) {
            throw new Error(`Unable to store ${obj} for later reanimation`);
        }
        this.jsonToObj.set(mummyJson, obj);
        const existing = this.objToJson.get(obj);
        if (existing !== undefined && existing !== mummyJson) {
            trace(debugReanimate, `WARN: reanimate: object '${obj}' already stored`);
            trace(debugReanimate, `Existing:`, existing, `New:`, mummyJson);
        } else {
            this.objToJson.set(obj, mummyJson);
        }
    }

    print() {
        if (!debugReanimate) return;
        trace(debugReanimate, "Registry - jsonToObj:");
        this.jsonToObj.forEach((key, val) => {
            trace(debugReanimate, `  ${key} -> ${val}`);
        });

        trace(debugReanimate, "\nRegistry - objToJson:");
        this.objToJson.forEach((key, val) => {
            trace(debugReanimate, `  ${key} -> ${val}`);
        });
    }
}

let registry = new MummyRegistry();

interface Mummy {
    name: string;
    namespace: string;
    pkgName: string;
    pkgVersion: string;
    relFilePath: string;
}
const mummyProps = ["name", "namespace", "pkgName", "pkgVersion", "relFilePath"];

function isMummy(val: any): val is Mummy {
    if (val == null || typeof val !== "object") {
        throw new Error(`Invalid JSON represenation of object`);
    }
    for (const prop of mummyProps) {
        const t = typeof val[prop];
        if (t !== "string") {
            throw new Error(`Invalid property '${prop}' type '${t}' in JSON representation of object`);
        }
    }
    return true;
}

function enbalm(obj: any, name: string, namespace: string, module: NodeModule): MummyJson {
    const pkgInfo = findPackageInfo(path.dirname(module.filename));
    const m: Mummy = {
        name,
        namespace,
        pkgName: pkgInfo.name,
        pkgVersion: pkgInfo.version,
        relFilePath: path.relative(path.dirname(pkgInfo.main), module.filename),
    };
    trace(debugReanimate, "mainFile:", pkgInfo.main, "\nmummy:", m);
    const s = stringify(m);
    trace(debugReanimate, "JSON value:", s);
    return s;
}

export function registerObject(obj: any, name: string,
                               modOrCallerNum: NodeModule | number = 0,
                               altNamespace = "$adaptExports") {
    if (obj == null) throw new Error(`Cannot register null or undefined`);

    const mod = findModule(modOrCallerNum);
    if (mod.exports == null) throw new Error(`Internal error: exports unexpectedly null`);

    // FIXME(mark): we should wait to run findExportName until
    // module.loaded === true. To do that, we should create a Promise, but
    // store it rather than returning it, to keep this function sync. Then
    // both reanimate and findMummy should ensure all promises are resolved before
    // continuing operation. That should allow us to remove the namespace
    // stuff.
    const exportName = findExportName(obj, name, mod);

    registry.entomb(obj, enbalm(obj, exportName || name,
                                exportName ? "" : altNamespace, mod));

    if (!exportName) {
        let exp = mod.exports[altNamespace];
        if (exp == null) {
            exp = Object.create(null);
            mod.exports[altNamespace] = exp;
        }
        exp[name] = obj;
    }
}

function findExportName(obj: any, defaultName: string,
                        module: NodeModule): string | undefined {
    // Try preferred first, in case this obj is exported under multiple
    // names.
    if (module.exports[defaultName] === obj) return defaultName;

    // obj is not exported as that name
    for (const k of Object.keys(module.exports)) {
        if (module.exports[k] === obj) return k;
    }
    return undefined;
}

function findModule(modOrCallerNum: NodeModule | number): NodeModule {
    let mod: NodeModule;

    if (typeof modOrCallerNum === "number") {
        if (modOrCallerNum < 0) {
            throw new Error(`registerObject: callerNum must be >= 0`);
        }
        // Back up the stack to caller of registerObject
        mod = callerModule(modOrCallerNum + 3);
    } else {
        mod = modOrCallerNum;
    }

    return mod;
}

// Exported for testing
export function callerModule(callerNum: number): NodeModule {
    if (!Number.isInteger(callerNum) || callerNum < 0) {
        throw new Error(`callerModule: invalid callerNum: ${callerNum}`);
    }
    const stack = callsites();
    if (callerNum >= stack.length) {
        throw new Error(`callerModule: callerNum too large: ${callerNum}, max: ${stack.length - 1}`);
    }

    const fileName = stack[callerNum].getFileName();
    if (fileName == null) {
        throw new Error(`callerModule: unable to get filename`);
    }

    const mod = require.cache[fileName];
    if (mod == null) {
        throw new Error(`callerModule: file ${fileName} not in cache`);
    }
    return mod;
}

export function reanimate(mummy: MummyJson): Promise<any> {
    return registry.awaken(mummy);
}

export function findMummy(obj: any): MummyJson {
    return registry.findMummy(obj);
}

// Exported for testing
export function mockRegistry_(newRegistry?: MummyRegistry): MummyRegistry {
    const oldRegistry = registry;
    if (newRegistry != null) registry = newRegistry;
    return oldRegistry;
}

type PackageId = string;
type PackagePath = string;
type PackageRegistry = Map<PackageId, PackagePath>;
let packageRegistry_: PackageRegistry | null = null;

async function packageRegistry(): Promise<PackageRegistry> {
    if (packageRegistry_ == null) {
        const moduleTree = await npm.lsParsed({ long: true });
        const newReg = new Map<PackageId, PackagePath>();
        if (moduleTree.path == null) {
            throw new Error(`Cannot create package registry: root path is null`);
        }
        findPaths(newReg, moduleTree.path, moduleTree.name || "unknown", moduleTree);
        if (debugPackageRegistry) {
            newReg.forEach((modPath, id) => {
                trace(debugPackageRegistry, `${id} -> ${modPath}`);
            });
        }
        packageRegistry_ = newReg;
    }
    return packageRegistry_;
}

/**
 * Walk the output of npm ls --json and for each package, extract it's _id
 * and package root directory, then store in the PackageRegistry.
 * @param reg PackageRegistry to store in
 * @param root Root directory of the topmost NPM module
 * @param name Name of the current package for where we are in the LsTree
 * @param tree The LsTree object for the current package (corresponding to name)
 */
function findPaths(reg: PackageRegistry, root: string, name: string, tree: npm.LsTree) {
    const { _id, _location, path: ppath } = tree;
    let loc: string | null = null;
    if (ppath != null) {
        loc = ppath; // ppath is absolute path
    } else if (_location) {
        loc = path.join(root,
            _location.startsWith("/") ? _location.substring(1) : _location);
    }

    if (_id != null && loc != null) {
        if (!reg.has(_id)) reg.set(_id, loc);
    } else {
        trace(debugReanimate, `WARN: cannot insert module '${name}' [_id: ${_id}, loc: ${loc}`);
    }
    processDeps(tree.dependencies);
    return;

    function processDeps(deps: npm.LsTrees | undefined) {
        if (deps == null) return;
        for (const mName of Object.keys(deps)) {
            findPaths(reg, root, mName, deps[mName]);
        }
    }
}

async function packagePath(pkg: Mummy): Promise<PackagePath | undefined> {
    const reg = await packageRegistry();
    return reg.get(packageId(pkg));
}

function packageId(pkg: Mummy): PackageId {
    return `${pkg.pkgName}@${pkg.pkgVersion}`;
}