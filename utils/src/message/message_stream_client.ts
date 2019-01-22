import ee2 from "eventemitter2";
import readline from "readline";
import stream from "stream";
import {
    badMessageType,
    isMessage,
    MessageClient,
    MessageEmitter,
    MessageType,
    parseTaskContent,
    TaskEmitter,
} from "./common";
import { logToStreams } from "./stringify";

type Emitters = Partial<Record<MessageType, ee2.EventEmitter2>>;

export interface MessageStreamClientOptions {
    inputStream?: stream.Readable;
    outStream?: stream.Writable;
    errStream?: stream.Writable;
}

export class MessageStreamClient implements MessageClient {
    readonly isMessageClient: true = true;
    protected outStream?: stream.Writable;
    protected errStream?: stream.Writable;
    private emitters: Emitters = {};

    constructor(options: MessageStreamClientOptions = {}) {
        if (options.outStream) this.outStream = options.outStream;
        if (options.errStream) this.errStream = options.errStream;
        if (options.inputStream) this.fromStream(options.inputStream);
    }

    fromStream(input: stream.Readable) {
        const rl = readline.createInterface({
            input,
            crlfDelay: Infinity,
        });
        rl.on("line", this.inputMessage);
    }

    get info(): MessageEmitter { return this.emitter(MessageType.info); }
    get warning(): MessageEmitter { return this.emitter(MessageType.warning); }
    get error(): MessageEmitter { return this.emitter(MessageType.error); }
    get task(): TaskEmitter { return this.emitter(MessageType.task); }

    private inputMessage = (line: string): void => {
        try {
            const msg = JSON.parse(line);
            if (!isMessage(msg)) throw new Error(`Invalid message`);
            const em = this.emitter(msg.type);

            switch (msg.type) {
                case MessageType.info:
                case MessageType.error:
                case MessageType.warning:
                    logToStreams(msg, this.outStream, this.errStream);
                    em.emit(`message:${msg.from}`, msg);
                    break;
                case MessageType.task:
                    const { event, status } = parseTaskContent(msg.content);
                    em.emit(`task:${event}:${msg.from}`, event, status);
                    break;
                default:
                    return badMessageType(msg.type);
            }
        } catch (err) {
            console.log(`Invalid Message: ${line}`);
        }
    }

    private emitter(name: MessageType) {
        let em = this.emitters[name];
        if (!em) {
            em = new ee2.EventEmitter2({
                wildcard: true,
                delimiter: ":",
            });
            this.emitters[name] = em;
        }
        return em;
    }
}
