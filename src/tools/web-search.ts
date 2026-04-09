import * as z from "zod";

import { McpTool, type ToolExecutionResult } from "./base-tool.js";
import type { ToolContext } from "../types/index.js";
import { createToolOutput } from "../utils/output-schema.js";

const schema = z.object({
  query: z.string().min(2),
});

type DuckDuckGoResponse = {
  Abstract?: string;
  AbstractURL?: string;
  Heading?: string;
  RelatedTopics?: Array<
    | {
        Text?: string;
        FirstURL?: string;
      }
    | {
        Topics?: Array<{
          Text?: string;
          FirstURL?: string;
        }>;
      }
  >;
};

type FlatTopic = {
  Text?: string;
  FirstURL?: string;
};

export class WebSearchTool extends McpTool<typeof schema> {
  public name = "web_search";
  public description =
    "Searches public web references using a free public search API and returns concise source candidates for the current question.";
  public inputSchema = schema;

  protected async execute(
    _context: ToolContext,
    input: z.infer<typeof schema>,
  ): Promise<ToolExecutionResult> {
    const url = new URL("https://api.duckduckgo.com/");
    url.searchParams.set("q", input.query);
    url.searchParams.set("format", "json");
    url.searchParams.set("no_html", "1");
    url.searchParams.set("skip_disambig", "1");

    let payload: DuckDuckGoResponse | null = null;

    try {
      const response = await fetch(url, {
        method: "GET",
        signal: AbortSignal.timeout(5000),
      });

      if (response.ok) {
        payload = (await response.json()) as DuckDuckGoResponse;
      }
    } catch {
      payload = null;
    }

    const flatTopics: FlatTopic[] =
      payload?.RelatedTopics?.flatMap((topic) =>
        "Topics" in topic && Array.isArray(topic.Topics)
          ? topic.Topics
          : [topic as FlatTopic],
      ) ?? [];

    const related = flatTopics.slice(0, 5).map((item) => ({
      title: item.Text ?? null,
      url: item.FirstURL ?? null,
    }));

    return {
      output: createToolOutput({
        status: payload ? "SUCCESS" : "PARTIAL",
        data: {
          query: input.query,
          heading: payload?.Heading ?? null,
          summary: payload?.Abstract ?? null,
          summaryUrl: payload?.AbstractURL ?? null,
          results: related,
        },
        confidence: payload ? 75 : 25,
        sources: ["DuckDuckGo Instant Answer API"],
        message: payload ? undefined : "Public web search did not return a usable result.",
      }),
      fhirSourceData: JSON.stringify({ query: input.query, payload }),
    };
  }
}
