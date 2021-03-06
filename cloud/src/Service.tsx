/*
 * Copyright 2019 Unbounded Systems, LLC
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

import { Component, WithChildren } from "@adpt/core";

/**
 * Props for {@link Service}
 * @public
 */
export interface ServiceProps extends WithChildren {
    /** Optional name for the service */
    name?: string;
}

/**
 * An abstract component that represents a group of components that
 * implements a service. Note that this is not necessarily a network
 * service, but will often be.
 *
 * @remarks
 * Typical children will be {@link NetworkService} and {@link Container} elements.
 *
 * @public
 */
export abstract class Service extends Component<ServiceProps, {}> {
}
export default Service;
