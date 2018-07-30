import { CommonOptions, run } from "./common";

export interface PublishOptions extends CommonOptions {
}

const defaultOptions: PublishOptions = {
};

export function publish(spec: string, options?: PublishOptions) {
    const finalOpts = { ...defaultOptions, ...options };

    return run("publish", finalOpts, [spec]);
}