/**
 * Agent state definition for privatedao-agent-exchange.
 */

import { BaseMessage } from "@langchain/core/messages";
import { Annotation } from "@langchain/langgraph";

export const HelloWorldStateAnnotation = Annotation.Root({
  messages: Annotation<BaseMessage[]>({
    reducer: (left, right) => left.concat(right),
    default: () => [],
  }),
});

export type HelloWorldState = typeof HelloWorldStateAnnotation.State;
