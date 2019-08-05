import { AdaptElement, Handle, isHandle, PrimitiveComponent, useMethod } from "@adpt/core";
import { FIXME_NeedsProperType, } from "@adpt/utils";
import { DockerImageInstance, ImageInfo } from "./docker";

/**
 * Description of a network port for a {@link Container}.
 *
 * @remarks
 * See the
 * {@link https://docs.docker.com/engine/api/v1.40/#operation/ContainerCreate | Docker API Reference}
 * for more information.
 * @public
 */
export type PortDescription = string | number;

/**
 * An image for a {@link Container}.
 *
 * @remarks
 * See the
 * {@link https://docs.docker.com/engine/api/v1.40/#operation/ContainerCreate | Docker API Reference}
 * for more information.
 * @public
 */
export type ImageId = string | Handle<DockerImageInstance>;

/**
 * A command to be used when creating a {@link Container}.
 *
 * @remarks
 * See the
 * {@link https://docs.docker.com/engine/api/v1.40/#operation/ContainerCreate | Docker API Reference}
 * for more information.
 * @public
 */
export type Command = string | string[];

/**
 * A single environment variable for a {@link Container}, expressed as an
 * object with `name` and `value` properties.
 *
 * @remarks
 * See the
 * {@link https://docs.docker.com/engine/api/v1.40/#operation/ContainerCreate | Docker API Reference}
 * for more information.
 * @public
 */
export interface EnvPair {
    name: string;
    value: string;
}

/**
 * A set of environment variables for a {@link Container}, expressed as an
 * array of objects with `name` and `value` properties.
 *
 * @remarks
 * See the
 * {@link https://docs.docker.com/engine/api/v1.40/#operation/ContainerCreate | Docker API Reference}
 * for more information.
 * @public
 */
export type EnvPairs = EnvPair[];

/**
 * A set of environment variables for a {@link Container}, expressed as a
 * single object with keys and associated values.
 *
 * @remarks
 * See the
 * {@link https://docs.docker.com/engine/api/v1.40/#operation/ContainerCreate | Docker API Reference}
 * for more information.
 * @public
 */
export interface EnvSimple {
    [key: string]: string;
}

/**
 * A set of environment variables for a {@link Container}.
 *
 * @remarks
 * See the
 * {@link https://docs.docker.com/engine/api/v1.40/#operation/ContainerCreate | Docker API Reference}
 * for more information.
 * @public
 */
export type Environment = EnvPair[] | EnvSimple;

/**
 * A set of ports to be bound for a {@link Container}.
 *
 * @remarks
 * See the
 * {@link https://docs.docker.com/engine/api/v1.40/#operation/ContainerCreate | Docker API Reference}
 * for more information.
 * @public
 */
export interface PortBinding {
    [ctrPort: number]: number;
    [ctrPort: string]: number;
}

/**
 * Network links to create for a {@link Container}.
 *
 * @remarks
 * See the
 * {@link https://docs.docker.com/engine/api/v1.40/#operation/ContainerCreate | Docker API Reference}
 * for more information.
 * @public
 */
export interface Links {
    [internalName: string]: string;
}

/**
 * Props for the {@link Container} component.
 *
 * @remarks
 * See the
 * {@link https://docs.docker.com/engine/api/v1.40/#operation/ContainerCreate | Docker API Reference}
 * for more information.
 * @public
 */
export interface ContainerProps {
    name: string;
    dockerHost: string;
    image: ImageId;

    autoRemove?: boolean;
    ports?: PortDescription[];
    stdinOpen?: boolean;
    stopSignal?: string;
    tty?: boolean;
    command?: Command;
    portBindings?: PortBinding;
    environment?: Environment;
    links?: Links;
    entrypoint?: Command;
    workingDir?: string;
    imagePullPolicy?: "Always" | "Never" | "IfNotPresent";
}

/**
 * State information for a {@link Container}.
 * @public
 */
export interface ContainerState {
    Status: string;
    Running: boolean;
    Paused: boolean;
    Restarting: boolean;
    OOMKilled: boolean;
    Dead: boolean;
    Pid: number;
    ExitCode: number;
    Error: string;
    StartedAt: string;
    FinishedAt: string;
}

/**
 * Status of a {@link Container}.
 * @public
 */
export interface ContainerStatus {
    Id: string;
    Created: string;
    Path: string;
    Args: string[];
    State: ContainerState;
    Image: string;
    ResolvConfPath: string;
    HostnamePath: string;
    HostsPath: string;
    Node: FIXME_NeedsProperType;
    Name: string;
    RestartCount: number;
    Driver: string;
    MountLabel: string;
    ProcessLabel: string;
    AppArmorProfile: string;
    ExecIDs: string;
    HostConfig: FIXME_NeedsProperType;
    GraphDriver: FIXME_NeedsProperType;
    SizeRw: number;
    SizeRootFs: number;
    Mounts: FIXME_NeedsProperType[];
    Config: FIXME_NeedsProperType;
    NetworkSettings: FIXME_NeedsProperType;
}

/**
 * Abstract component representing a container.
 * @public
 */
export abstract class Container extends PrimitiveComponent<ContainerProps> {
    static defaultProps = {
        dockerHost: "unix:///var/run/docker.sock",
        autoRemove: true,
        ports: [],
        stdinOpen: false,
        tty: false,
        portBindings: {},
        environment: {},
        links: {},
        imagePullPolicy: "IfNotPresent",
    };
    static displayName = "cloud.Container";
}
export default Container;

/**
 * Function to check whether an {@link @adpt/core#AdaptElement} is an
 * abstract {@link Container}.
 * @public
 */
export function isContainerElement(el: AdaptElement): el is AdaptElement<ContainerProps> {
    return el.componentType as any === Container;
}

/**
 * Combine multiple {@link Environment} objects into a single array of
 * {@link EnvPair} objects. Returns `undefined` if there are no `Environment`
 * objects provided.
 * @remarks
 * If more than one `Environment` object specifies the same environment variable
 * name, the last one present in the array of arguments takes precedence.
 * @public
 */
export function mergeEnvPairs(...envs: (Environment | undefined)[]): EnvPairs | undefined {
    const vals = new Map<string, EnvPair>();
    for (const e of envs) {
        if (!e) continue;
        if (Array.isArray(e)) e.forEach((pair) => vals.set(pair.name, pair));
        else Object.keys(e).map((name) => vals.set(name, { name, value: e[name] }));
    }
    return vals.size ? [ ...vals.values() ] : undefined;
}

/**
 * Combine multiple {@link Environment} objects into a single
 * {@link EnvSimple} object. Returns `undefined` if there are no `Environment`
 * objects provided.
 * @remarks
 * If more than one `Environment` object specifies the same environment variable
 * name, the last one present in the array of arguments takes precedence.
 * @public
 */
export function mergeEnvSimple(...envs: (Environment | undefined)[]): EnvSimple | undefined {
    let ret: EnvSimple | undefined;
    envs.forEach((e) => {
        if (!e) return;
        if (!ret) ret = {};
        if (Array.isArray(e)) {
            e.forEach((pair) => (ret as EnvSimple)[pair.name] = pair.value);
        } else {
            Object.assign(ret, e);
        }
    });
    return ret;
}

/**
 * Hook function to translate an {@link ImageId} (which can be either a
 * Handle or an image name string) into an image name string.
 * @beta
 */
export function useLatestImageFrom(source: ImageId): string | undefined {
    // useMethod hook must be called unconditionally, even if source isn't a handle
    const hand = isHandle(source) ? source : null;
    const image = useMethod<ImageInfo | undefined>(hand, undefined, "latestImage");
    if (image && !image.nameTag) throw new Error(`Built image info has no nameTag`);
    return (typeof source === "string") ? source :
        image ? image.nameTag :
        undefined;
}
