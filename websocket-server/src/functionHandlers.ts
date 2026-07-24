import { FunctionHandler } from "./types";
import { runWebSearch } from "./webSearch";

const functions: FunctionHandler[] = [];

functions.push({
  schema: {
    name: "get_weather_from_coords",
    type: "function",
    description: "Get the current weather",
    parameters: {
      type: "object",
      properties: {
        latitude: {
          type: "number",
        },
        longitude: {
          type: "number",
        },
      },
      required: ["latitude", "longitude"],
    },
  },
  handler: async (args: { latitude: number; longitude: number }) => {
    const response = await fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${args.latitude}&longitude=${args.longitude}&current=temperature_2m,wind_speed_10m&hourly=temperature_2m,relative_humidity_2m,wind_speed_10m`
    );
    const data = await response.json();
    const currentTemp = data.current?.temperature_2m;
    return JSON.stringify({ temp: currentTemp });
  },
});

functions.push({
  schema: {
    name: "web_search",
    type: "function",
    description:
      "Mandatory for any question whose correct answer could depend on today's date: " +
      "today's/tomorrow's weather, sports results or schedules, news, prices, or any event " +
      "that may not have happened yet as of today. Your training data has a cutoff date and " +
      "cannot be trusted for these - NEVER guess or answer from memory for them, even if you " +
      "feel confident. Always call this tool first and answer only from its results. This " +
      "applies whether or not the caller explicitly says to search or look something up.",
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "The search query, in the caller's language if possible.",
        },
      },
      required: ["query"],
    },
  },
  handler: async (args: { query: string }) => {
    return runWebSearch(args.query);
  },
});

export default functions;
