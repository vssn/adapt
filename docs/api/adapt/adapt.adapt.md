---
id: adapt.adapt
title: Adapt namespace
hide_title: true
---
<!-- Do not edit this file. It is automatically generated by API Documenter. -->

[@usys/adapt](./adapt.md) &gt; [Adapt](./adapt.adapt.md)

## Adapt namespace

<b>Signature:</b>

```typescript
export * from "./hooks";
export * from "./jsx_namespace";
export { childrenToArray, cloneElement, createElement, Component, DeferredComponent, PrimitiveComponent, AdaptElement, AdaptMountedElement, AdaptElementOrNull, AdaptPrimitiveElement, AnyProps, AnyState, BuildHelpers, FinalDomElement, BuiltinProps, ElementPredicate, PartialFinalDomElement, isApplyStyle, isFinalDomElement, isElement, isPartialFinalDomElement, isMountedElement, isDeferredElement, isPrimitiveElement, isReady, WithChildren, PropsType, SFC, SFCBuildProps, SFCDeclProps, } from "./jsx";
export * from "./builtin_components";
export * from "./deploy";
export { build, BuildData, buildOnce, BuildOutput, DomPath } from "./dom";
export { concatStyles, Style, StyleBuildInfo, rule, ruleNoRematch, findElementsInDom, findPathsInDom } from "./css";
export { serializeDom, } from "./dom_serialize";
export * from "./dom_build_data_recorder";
export * from "./dom_utils";
export { BuildNotImplemented, ProjectBuildError, ProjectCompileError, ProjectRunError, } from "./error";
export { handle, Handle, isHandle } from "./handle";
export { isDefaultKey } from "./keys";
export { Context, createContext, useContext } from "./context";
export { stack, } from "./stack";
export { StateStore, createStateStore } from "./state";
export * from "./ops";
export { registerObserver, gql, Observer, ObserverPlugin, ObserverResponse, ObserverNeedsData, ExecutedQuery, throwObserverErrors, } from "./observers";
export { DeployOpID, } from "./server";
export { defaultChildStatus, errorToNoStatus, gqlGetOriginalErrors, mergeDefaultChildStatus, NoStatus, noStatusOnError, ObserveForStatus, Status, } from "./status";
export { Children } from "./type_support";
export { Constructor, Logger, Message, MessageLogger, } from "@usys/utils";
export { deepFilterElemsToPublic } from "./utils/dom-filter";
import * as internal from "./internal";
export { internal, };
//# sourceMappingURL=exports.d.ts.map
```

## Classes

|  Class | Description |
|  --- | --- |
|  [DomError](./adapt.adapt.domerror.md) |  |
|  [Group](./adapt.adapt.group.md) |  |
|  [Sequence](./adapt.adapt.sequence.md) |  |
|  [WidgetPlugin](./adapt.adapt.widgetplugin.md) |  |

## Enumerations

|  Enumeration | Description |
|  --- | --- |
|  [ChangeType](./adapt.adapt.changetype.md) |  |
|  [DeployOpStatusExt](./adapt.adapt.deployopstatusext.md) |  |
|  [DeployStatus](./adapt.adapt.deploystatus.md) |  |
|  [InternalStatus](./adapt.adapt.internalstatus.md) |  |

## Functions

|  Function | Description |
|  --- | --- |
|  [AllOf(h, deps)](./adapt.adapt.allof.md) |  |
|  [AnyOf(h, deps)](./adapt.adapt.anyof.md) |  |
|  [buildPrinter()](./adapt.adapt.buildprinter.md) |  |
|  [createDeployment(options)](./adapt.adapt.createdeployment.md) |  |
|  [createHookInfo()](./adapt.adapt.createhookinfo.md) |  |
|  [currentContext()](./adapt.adapt.currentcontext.md) |  |
|  [destroyDeployment(optionsIn)](./adapt.adapt.destroydeployment.md) |  |
|  [domActiveElems(diff)](./adapt.adapt.domactiveelems.md) | Given a DomDiff, generated from an old and new DOM, returns an Array of the Elements that will be active if this DomDiff is deployed. That means all of the Elements in the new DOM plus the deleted Elements from the old DOM. |
|  [domDiff(oldDom, newDom, idFunc)](./adapt.adapt.domdiff.md) |  |
|  [domForEach(dom, f)](./adapt.adapt.domforeach.md) |  |
|  [domMap(dom, f)](./adapt.adapt.dommap.md) |  |
|  [fetchStatus(options)](./adapt.adapt.fetchstatus.md) |  |
|  [finishHooks()](./adapt.adapt.finishhooks.md) |  |
|  [goalToInProgress(stat)](./adapt.adapt.goaltoinprogress.md) |  |
|  [isDeployStatus(val)](./adapt.adapt.isdeploystatus.md) |  |
|  [isDomErrorElement(element)](./adapt.adapt.isdomerrorelement.md) |  |
|  [isFinalStatus(ds)](./adapt.adapt.isfinalstatus.md) |  |
|  [isGoalStatus(ds)](./adapt.adapt.isgoalstatus.md) |  |
|  [isInProgress(stat)](./adapt.adapt.isinprogress.md) |  |
|  [isProxying(stat)](./adapt.adapt.isproxying.md) |  |
|  [isRelation(v)](./adapt.adapt.isrelation.md) |  |
|  [listDeployments(options)](./adapt.adapt.listdeployments.md) |  |
|  [logElements(msg, elements, logger)](./adapt.adapt.logelements.md) |  |
|  [None()](./adapt.adapt.none.md) |  |
|  [Only(h, dep)](./adapt.adapt.only.md) |  |
|  [registerPlugin(plugin)](./adapt.adapt.registerplugin.md) |  |
|  [startHooks(context)](./adapt.adapt.starthooks.md) |  |
|  [toDeployStatus(stat)](./adapt.adapt.todeploystatus.md) |  |
|  [updateDeployment(options)](./adapt.adapt.updatedeployment.md) |  |
|  [useBuildHelpers()](./adapt.adapt.usebuildhelpers.md) |  |
|  [useDependsOn(f)](./adapt.adapt.usedependson.md) |  |
|  [useDeployedWhen(f)](./adapt.adapt.usedeployedwhen.md) |  |
|  [useImperativeMethods(create)](./adapt.adapt.useimperativemethods.md) |  |
|  [useReadyFrom(targetHand)](./adapt.adapt.usereadyfrom.md) |  |
|  [useState(init)](./adapt.adapt.usestate.md) |  |

## Interfaces

|  Interface | Description |
|  --- | --- |
|  [ActComplete](./adapt.adapt.actcomplete.md) |  |
|  [Action](./adapt.adapt.action.md) |  |
|  [ActionChange](./adapt.adapt.actionchange.md) | Describes the effect an Action has on an Element type and detail here explain how the Action affects this specific element, which may or may not be different than the action. For example, an Action that performs a modify on a CloudFormation stack may cause certain Elements to be created and deleted within that Action. |
|  [ActionInfo](./adapt.adapt.actioninfo.md) | Describes the overall effect that an Action is performing. type and detail here explain what the Action is doing overall, not how it affects any particular Element. |
|  [ActOptions](./adapt.adapt.actoptions.md) |  |
|  [BuildContext](./adapt.adapt.buildcontext.md) |  |
|  [BuildOpAscend](./adapt.adapt.buildopascend.md) |  |
|  [BuildOpDescend](./adapt.adapt.buildopdescend.md) |  |
|  [BuildOpDone](./adapt.adapt.buildopdone.md) |  |
|  [BuildOpElementBuilt](./adapt.adapt.buildopelementbuilt.md) |  |
|  [BuildOpElementDone](./adapt.adapt.buildopelementdone.md) |  |
|  [BuildOpError](./adapt.adapt.buildoperror.md) |  |
|  [BuildOpStart](./adapt.adapt.buildopstart.md) |  |
|  [BuildOpStep](./adapt.adapt.buildopstep.md) |  |
|  [CreateOptions](./adapt.adapt.createoptions.md) |  |
|  [DeployHelpers](./adapt.adapt.deployhelpers.md) |  |
|  [DeploymentInfo](./adapt.adapt.deploymentinfo.md) |  |
|  [DestroyOptions](./adapt.adapt.destroyoptions.md) |  |
|  [DomDiff](./adapt.adapt.domdiff.md) |  |
|  [DomErrorProps](./adapt.adapt.domerrorprops.md) |  |
|  [ExecuteComplete](./adapt.adapt.executecomplete.md) |  |
|  [ExecuteOptions](./adapt.adapt.executeoptions.md) |  |
|  [ExecutionPlan](./adapt.adapt.executionplan.md) |  |
|  [ExecutionPlanOptions](./adapt.adapt.executionplanoptions.md) |  |
|  [GroupProps](./adapt.adapt.groupprops.md) |  |
|  [HookInfo](./adapt.adapt.hookinfo.md) |  |
|  [ListOptions](./adapt.adapt.listoptions.md) |  |
|  [ListResponse](./adapt.adapt.listresponse.md) |  |
|  [Observed](./adapt.adapt.observed.md) |  |
|  [Plugin](./adapt.adapt.plugin.md) |  |
|  [PluginConfig](./adapt.adapt.pluginconfig.md) |  |
|  [PluginManager](./adapt.adapt.pluginmanager.md) |  |
|  [PluginManagerStartOptions](./adapt.adapt.pluginmanagerstartoptions.md) |  |
|  [PluginModule](./adapt.adapt.pluginmodule.md) |  |
|  [PluginObservations](./adapt.adapt.pluginobservations.md) |  |
|  [PluginOptions](./adapt.adapt.pluginoptions.md) |  |
|  [PluginRegistration](./adapt.adapt.pluginregistration.md) |  |
|  [QueryDomain](./adapt.adapt.querydomain.md) |  |
|  [Relation](./adapt.adapt.relation.md) |  |
|  [RelationExt](./adapt.adapt.relationext.md) |  |
|  [SequenceProps](./adapt.adapt.sequenceprops.md) |  |
|  [StatusOptions](./adapt.adapt.statusoptions.md) |  |
|  [UpdateOptions](./adapt.adapt.updateoptions.md) |  |
|  [Waiting](./adapt.adapt.waiting.md) |  |
|  [WidgetChange](./adapt.adapt.widgetchange.md) |  |
|  [WidgetPair](./adapt.adapt.widgetpair.md) |  |

## Namespaces

|  Namespace | Description |
|  --- | --- |
|  [internal](./adapt.adapt.internal.md) |  |
|  [JSX](./adapt.adapt.jsx.md) |  |

## Variables

|  Variable | Description |
|  --- | --- |
|  [And](./adapt.adapt.and.md) |  |
|  [defaultDomDiffId](./adapt.adapt.defaultdomdiffid.md) |  |
|  [Edge](./adapt.adapt.edge.md) |  |
|  [False](./adapt.adapt.false.md) |  |
|  [Identity](./adapt.adapt.identity.md) |  |
|  [isDependsOn](./adapt.adapt.isdependson.md) |  |
|  [Not](./adapt.adapt.not.md) |  |
|  [Or](./adapt.adapt.or.md) |  |
|  [True](./adapt.adapt.true.md) |  |
|  [Value](./adapt.adapt.value.md) |  |
|  [waiting](./adapt.adapt.waiting.md) |  |

## Type Aliases

|  Type Alias | Description |
|  --- | --- |
|  [BoolVal](./adapt.adapt.boolval.md) |  |
|  [BuildListener](./adapt.adapt.buildlistener.md) |  |
|  [BuildOp](./adapt.adapt.buildop.md) |  |
|  [CombinedState](./adapt.adapt.combinedstate.md) |  |
|  [Defaultize](./adapt.adapt.defaultize.md) |  |
|  [Dependency](./adapt.adapt.dependency.md) |  |
|  [DependsOn](./adapt.adapt.dependson.md) |  |
|  [DependsOnMethod](./adapt.adapt.dependsonmethod.md) |  |
|  [DeployedWhenMethod](./adapt.adapt.deployedwhenmethod.md) |  |
|  [DeployOpStatus](./adapt.adapt.deployopstatus.md) |  |
|  [DeployStatusExt](./adapt.adapt.deploystatusext.md) |  |
|  [DomDiffIdFunc](./adapt.adapt.domdiffidfunc.md) |  |
|  [FinalStatus](./adapt.adapt.finalstatus.md) |  |
|  [GoalStatus](./adapt.adapt.goalstatus.md) |  |
|  [IsDeployedFunc](./adapt.adapt.isdeployedfunc.md) |  |
|  [PluginInstances](./adapt.adapt.plugininstances.md) |  |
|  [PluginKey](./adapt.adapt.pluginkey.md) |  |
|  [PluginModules](./adapt.adapt.pluginmodules.md) |  |
|  [RelationOp](./adapt.adapt.relationop.md) |  |
|  [SetState](./adapt.adapt.setstate.md) |  |
|  [StateInfo](./adapt.adapt.stateinfo.md) |  |
|  [StateUpdater](./adapt.adapt.stateupdater.md) |  |
|  [UseStateInit](./adapt.adapt.usestateinit.md) |  |
|  [WaitStatus](./adapt.adapt.waitstatus.md) |  |