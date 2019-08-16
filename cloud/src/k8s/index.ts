/*
 * Copyright 2018-2019 Unbounded Systems, LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

export * from "./Container";
export * from "./Resource"; //This must be before Pod and Service, but why?
export * from "./Pod";
export * from "./Service";
export * from "./ServiceDeployment";
export * from "./common";

export {
    K8sPlugin,
    createK8sPlugin,
    resourceElementToName,
    registerResourceKind
} from "./k8s_plugin";
