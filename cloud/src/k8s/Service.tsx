import Adapt, {
    AnyProps,
    BuildData,
    BuildHelpers,
    BuiltinProps,
    Component,
    gql,
    Handle,
    isHandle,
    isMountedElement,
    ObserveForStatus
} from "@usys/adapt";
import { removeUndef } from "@usys/utils";
import stringify from "json-stable-stringify";
import { isEqual, pick } from "lodash";
import * as abs from "../NetworkService";
import { computeNamespaceFromMetadata, Kind, ResourceService } from "./common";
import { K8sObserver } from "./k8s_observer";
import { resourceElementToName, resourceIdToName } from "./k8s_plugin";
import { Resource, ResourceProps } from "./Resource";

// FIXME(mark): Remove comment when working
// CLI that exposes a port
// tslint:disable-next-line:max-line-length
// kubectl expose pod fixme-manishv-nodecellar.nodecellar-compute.nodecellar-compute0 --port 8080 --target-port 8080 --name nodecellar

export interface ServiceProps extends ServiceSpec {
    config: any; //Legal configuration loaded from kubeconfig
    selector?: Handle | object;
}

export interface ServiceSpec {
    // clusterIP is the IP address of the service and is usually assigned
    // randomly by the master. If an address is specified manually and is not
    // in use by others, it will be allocated to the service; otherwise,
    // creation of the service will fail. This field can not be changed through
    // updates. Valid values are "None", empty string (""), or a valid IP
    // address. "None" can be specified for headless services when proxying is
    // not required. Only applies to types ClusterIP, NodePort, and
    // LoadBalancer. Ignored if type is ExternalName. More info:
    // https://kubernetes.io/docs/concepts/services-networking/service/#virtual-ips-and-service-proxies
    clusterIP?: string;
    // externalIPs is a list of IP addresses for which nodes in the cluster
    // will also accept traffic for this service. These IPs are not managed by
    // Kubernetes. The user is responsible for ensuring that traffic arrives at
    // a node with this IP. A common example is external load-balancers that are
    // not part of the Kubernetes system.
    externalIPs?: string[];
    // externalName is the external reference that kubedns or equivalent
    // will return as a CNAME record for this service. No proxying will be
    // involved. Must be a valid RFC-1123 hostname
    // (https://tools.ietf.org/html/rfc1123) and requires Type to be ExternalName.
    externalName?: string;
    // externalTrafficPolicy denotes if this Service desires to route
    // external traffic to node-local or cluster-wide endpoints. "Local" preserves
    // the client source IP and avoids a second hop for LoadBalancer and Nodeport
    // type services, but risks potentially imbalanced traffic spreading. "Cluster"
    // obscures the client source IP and may cause a second hop to another node,
    // but should have good overall load-spreading.
    externalTrafficPolicy?: string;
    // healthCheckNodePort specifies the healthcheck nodePort for
    // the service. If not specified, HealthCheckNodePort is created by the service
    // api backend with the allocated nodePort. Will use user-specified nodePort
    // value if specified by the client. Only effects when Type is set to
    // LoadBalancer and ExternalTrafficPolicy is set to Local.
    healthCheckNodePort?: number;
    // Only applies to Service Type: LoadBalancer LoadBalancer will
    // get created with the IP specified in this field. This feature depends on
    // whether the underlying cloud-provider supports specifying the loadBalancerIP
    // when a load balancer is created. This field will be ignored if the
    // cloud-provider does not support the feature.
    loadBalancerIP?: string;
    // If specified and supported by the platform, this will
    // restrict traffic through the cloud-provider load-balancer will be restricted
    // to the specified client IPs. This field will be ignored if the cloud-provider
    // does not support the feature." More info:
    // https://kubernetes.io/docs/tasks/access-application-cluster/configure-cloud-provider-firewall/
    loadBalancerSourceRanges?: string[];
    // The list of ports that are exposed by this service. More info:
    // https://kubernetes.io/docs/concepts/services-networking/service/#virtual-ips-and-service-proxies
    // patch strategy: merge
    // patch merge key: port
    ports?: ServicePort[];
    // publishNotReadyAddresses, when set to true, indicates that
    // DNS implementations must publish the notReadyAddresses of subsets for the
    // Endpoints associated with the Service. The default value is false. The
    // primary use case for setting this field is to use a StatefulSet's Headless
    // Service to propagate SRV records for its Pods without respect to their
    // readiness for purpose of peer discovery.
    publishNotReadyAddresses?: boolean;
    // Route service traffic to pods with label keys and values
    // matching this selector. If empty or not present, the service is assumed to
    // have an external process managing its endpoints, which Kubernetes will not
    // modify. Only applies to types ClusterIP, NodePort, and LoadBalancer.
    // Ignored if type is ExternalName. More info:
    // https://kubernetes.io/docs/concepts/services-networking/service/
    selector?: object;
    // Supports "ClientIP" and "None". Used to maintain session
    // affinity. Enable client IP based session affinity. Must be ClientIP or
    // None. Defaults to None. More info:
    // https://kubernetes.io/docs/concepts/services-networking/service/#virtual-ips-and-service-proxies
    sessionAffinity?: string;
    // sessionAffinityConfig contains the configurations of session affinity.
    //sessionAffinityConfig?: SessionAffinityConfig;
    // type determines how the Service is exposed. Defaults to
    // ClusterIP. Valid options are ExternalName, ClusterIP, NodePort, and
    // LoadBalancer. "ExternalName" maps to the specified externalName.
    // "ClusterIP" allocates a cluster-internal IP address for load-balancing to
    // endpoints. Endpoints are determined by the selector or if that is not
    // specified, by manual construction of an Endpoints object. If clusterIP is
    // "None", no virtual IP is allocated and the endpoints are published as a
    // set of endpoints rather than a stable IP. "NodePort" builds on ClusterIP
    // and allocates a port on every node which routes to the clusterIP.
    // "LoadBalancer" builds on NodePort and creates an external load-balancer
    // (if supported in the current cloud) which routes to the clusterIP.
    // More info:
    // https://kubernetes.io/docs/concepts/services-networking/service/#publishing-services---service-types
    type?: string;
}

export interface ServicePort {
    // The name of this port within the service. This must be a DNS_LABEL.
    // All ports within a ServiceSpec must have unique names. This maps to the
    // Name' field in EndpointPort objects. Optional if only one ServicePort is
    // defined on this service.
    name?: string;
    // The port on each node on which this service is exposed when
    // type=NodePort or LoadBalancer. Usually assigned by the system. If
    // specified, it will be allocated to the service if unused or else creation
    // of the service will fail. Default is to auto-allocate a port if the
    // ServiceType of this Service requires one. More info:
    // https://kubernetes.io/docs/concepts/services-networking/service/#type-nodeport
    nodePort?: number;
    // The port that will be exposed by this service.
    port?: number;
    // The IP protocol for this port. Supports "TCP" and "UDP". Default is TCP.
    protocol?: string;
    // Number or name of the port to access on the pods targeted by the
    // service. Number must be in the range 1 to 65535. Name must be an
    // IANA_SVC_NAME. If this is a string, it will be looked up as a named port
    // in the target Pod's container ports. If this is not specified, the value
    // of the 'port' field is used (an identity map). This field is ignored for
    // services with clusterIP=None, and should be omitted or set equal to the
    // 'port' field. More info:
    // https://kubernetes.io/docs/concepts/services-networking/service/#defining-a-service
    targetPort?: number | string;
}

export function k8sServiceProps(abstractProps: abs.NetworkServiceProps): ServiceSpec {
    if (typeof abstractProps.port !== "number") throw new Error(`Service: Port string not yet implemented`);
    if (abstractProps.ip != null) throw new Error(`Service: IP not yet implemented`);
    if (abstractProps.name != null) throw new Error(`Service: name not yet implemented`);

    const port: ServicePort = {
        // FIXME(mark): Should NetworkService expose two different ports?
        port: abstractProps.port,
        targetPort: abstractProps.port,
    };
    if (abstractProps.protocol != null) port.protocol = abstractProps.protocol;

    const ret: ServiceSpec = {
        ports: [port],
    };

    return ret;
}

interface ServiceState {
    endpointSelector?: { [key: string]: string };
}

export class Service extends Component<ServiceProps, ServiceState> {
    static defaultProps = {
        sessionAffinity: "None",
        type: "ClusterIP",
    };

    initialState() { return {}; }

    updateState(helpers: BuildHelpers) {
        const deployID = helpers.deployID;
        this.setState((_prev, props) => {
            const { selector: ep } = props as ServiceProps & BuiltinProps;
            if (!isHandle(ep)) return {};
            if (!ep.target) return {};
            if (!isMountedElement(ep.target)) return {};

            if (ep.target.componentType !== Resource) {
                throw new Error(`Cannot handle k8s.Service endpoint of type ${ep.target.componentType.name}`);
            }
            const epProps: ResourceProps = ep.target.props as AnyProps as ResourceProps;
            if (epProps.kind !== Kind.pod) {
                throw new Error(`Cannot have k8s.Service endpoint of kind ${epProps.kind}`);
            }
            return {
                endpointSelector: {
                    adaptName: resourceElementToName(ep.target, deployID)
                }
            };
        });
    }

    build(helpers: BuildHelpers) {
        const manifest = makeSvcManifest(this.props, this.state);
        this.updateState(helpers);
        return (
            <Resource
                key={this.props.key}
                config={this.props.config}
                kind={manifest.kind}
                metadata={manifest.metadata}
                spec={manifest.spec}
            />);
    }

    async status(_observe: ObserveForStatus, buildData: BuildData) {
        const succ = buildData.successor;
        if (!succ) return undefined;
        return succ.status();
    }
}

/*
 * Plugin info
 */
const knownServiceSpecPaths = [
    // FIXME(mark): Requires more complex compare logic
    //"clusterIP",

    "externalIPs",  // array
    "externalName",
    "externalTrafficPolicy",
    "healthCheckNodePort",
    "loadBalancerIP",
    "loadBalancerSourceRanges",  // array
    "ports",  // array
    "publishNotReadyAddresses",
    "selector", // object
    "sessionAffinity",
    //"sessionAffinityConfig", // object
    "type",
];

type ArrayKeys<T> = { [K in keyof T]: Required<T>[K] extends any[] ? K : never }[keyof T];
/**
 * Given an object, will sort any properties of that object that are arrays.
 * The sort of each array happens in-place, modifying the original arrays.
 * @param obj An object whose array properties will be sorted
 * @param keys  The specific property names to sort
 */
function sortArrays<T extends object>(obj: T, keys: ArrayKeys<T>[]): void {
    for (const k of keys) {
        const arr = obj[k];
        if (arr === undefined) continue;
        if (!Array.isArray(arr)) throw new Error(`Unable to sort non-array (key=${k})`);
        if (arr.length === 0) continue;
        if (typeof arr[0] === "string") arr.sort();
        else {
            arr.sort((a, b) => {
                a = stringify(a);
                b = stringify(b);
                return a === b ? 0 :
                    a < b ? -1 : 1;
            });
        }
    }
}

function canonicalize(spec: ServiceSpec): ServiceSpec {
    const s = pick(spec, knownServiceSpecPaths) as ServiceSpec;
    sortArrays(s, [
        "externalIPs",
        "loadBalancerSourceRanges",
        "ports",
    ]);
    return removeUndef(s);
}

function serviceSpecsEqual(spec1: ServiceSpec, spec2: ServiceSpec) {
    spec1 = canonicalize(spec1);
    spec2 = canonicalize(spec2);
    return isEqual(spec1, spec2);
}

function makeSvcManifest(props: ServiceProps & Partial<BuiltinProps>, state: ServiceState): ResourceService {
    const { config, key, handle, ...spec } = props;

    // Explicit default for ports.protocol
    if (spec.ports) {
        for (const p of spec.ports) {
            if (p.protocol === undefined) p.protocol = "TCP";
        }
    }
    return {
        kind: Kind.service,
        metadata: {},
        spec: { ...spec, selector: isHandle(spec.selector) ? state.endpointSelector : spec.selector },
        config,
    };
}

export const serviceResourceInfo = {
    kind: Kind.service,
    apiName: "services",
    statusQuery: async (props: ResourceProps, observe: ObserveForStatus, buildData: BuildData) => {
        const obs: any = await observe(K8sObserver, gql`
            query ($name: String!, $kubeconfig: JSON!, $namespace: String!) {
                withKubeconfig(kubeconfig: $kubeconfig) {
                    readCoreV1NamespacedService(name: $name, namespace: $namespace) @all(depth: 100)
                }
            }`,
            {
                name: resourceIdToName(buildData.id, buildData.deployID),
                kubeconfig: props.config,
                namespace: computeNamespaceFromMetadata(props.metadata)
            }
        );
        return obs.withKubeconfig.readCoreV1NamespacedService;
    },
    specsEqual: serviceSpecsEqual,
};
