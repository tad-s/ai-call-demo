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
      "Search the web for information you don't already know or that changes over time " +
      "(e.g. today's or tomorrow's weather, recent sports results, current news, prices). " +
      "Use this whenever the caller asks about something time-sensitive or recent.",
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
