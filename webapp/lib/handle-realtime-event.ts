import { Item } from "@/components/types";

export default function handleRealtimeEvent(
  ev: any,
  setItems: React.Dispatch<React.SetStateAction<Item[]>>
) {
  // Helper function to create a new item with default fields
  function createNewItem(base: Partial<Item>): Item {
    return {
      object: "realtime.item",
      timestamp: new Date().toLocaleTimeString(),
      ...base,
    } as Item;
  }

  // Helper function to update an existing item if found by id, or add a new one if not.
  // We can also pass partial updates to reduce repetitive code.
  function updateOrAddItem(id: string, updates: Partial<Item>): void {
    setItems((prev) => {
      const idx = prev.findIndex((m) => m.id === id);
      if (idx >= 0) {
        const updated = [...prev];
        updated[idx] = { ...updated[idx], ...updates };
        return updated;
      } else {
        return [...prev, createNewItem({ id, ...updates })];
      }
    });
  }

  const { type } = ev;

  switch (type) {
    case "session.created": {
      // Starting a new session, clear all items
      setItems([]);
      break;
    }

    case "input_audio_buffer.speech_started": {
      // Create a user message item with running status and placeholder content
      const { item_id } = ev;
      setItems((prev) => [
        ...prev,
        createNewItem({
          id: item_id,
          type: "message",
          role: "user",
          content: [{ type: "text", text: "..." }],
          status: "running",
        }),
      ]);
      break;
    }

    case "conversation.item.added":
    case "conversation.item.created": {
      const { item } = ev;
      if (item.type === "message") {
        // A completed message from user or assistant
        // Normalize content: GA API may return {type:"audio", transcript:"..."} instead of {type:"text", text:"..."}
        const normalizedContent = (item.content || []).map((c: any) => ({
          type: "text",
          text: c.text ?? c.transcript ?? "",
        })).filter((c: any) => c.text !== "");
        setItems((prev) => {
          const idx = prev.findIndex((m) => m.id === item.id);
          if (idx >= 0) {
            const updated = [...prev];
            // Preserve existing content if it already has text (built by delta events),
            // only overwrite with normalized content if existing content is empty/placeholder
            const existingContent = updated[idx].content || [];
            const existingText = existingContent.map((c) => c.text ?? "").join("");
            const shouldPreserveExisting = existingText.length > 3; // preserve if meaningful text exists
            updated[idx] = {
              ...updated[idx],
              ...item,
              content: shouldPreserveExisting ? existingContent : (normalizedContent.length > 0 ? normalizedContent : existingContent),
              status: "completed",
              timestamp:
                updated[idx].timestamp || new Date().toLocaleTimeString(),
            };
            return updated;
          } else {
            return [
              ...prev,
              createNewItem({
                ...item,
                content: normalizedContent,
                status: "completed",
              }),
            ];
          }
        });
      }
      // NOTE: We no longer handle function_call items here.
      // The handling of function_call items has been moved to the "response.output_item.done" event.
      else if (item.type === "function_call_output") {
        // Function call output item created
        // Add the output item and mark the corresponding function_call as completed
        // Also display in transcript as tool message with the response
        setItems((prev) => {
          const newItems = [
            ...prev,
            createNewItem({
              ...item,
              role: "tool",
              content: [
                {
                  type: "text",
                  text: `Function call response: ${item.output}`,
                },
              ],
              status: "completed",
            }),
          ];

          return newItems.map((m) =>
            m.call_id === item.call_id && m.type === "function_call"
              ? { ...m, status: "completed" }
              : m
          );
        });
      }
      break;
    }

    case "conversation.item.input_audio_transcription.completed": {
      // Update the user message with the final transcript
      const { item_id, transcript } = ev;
      setItems((prev) =>
        prev.map((m) =>
          m.id === item_id && m.type === "message" && m.role === "user"
            ? {
                ...m,
                content: [{ type: "text", text: transcript }],
                status: "completed",
              }
            : m
        )
      );
      break;
    }

    case "response.content_part.added": {
      const { item_id, part, output_index } = ev;
      // Append new content to the assistant message if output_index == 0
      if (part.type === "text" && output_index === 0) {
        setItems((prev) => {
          const idx = prev.findIndex((m) => m.id === item_id);
          if (idx >= 0) {
            const updated = [...prev];
            const existingContent = updated[idx].content || [];
            updated[idx] = {
              ...updated[idx],
              content: [
                ...existingContent,
                { type: part.type, text: part.text },
              ],
            };
            return updated;
          } else {
            // If the item doesn't exist yet, create it as a running assistant message
            return [
              ...prev,
              createNewItem({
                id: item_id,
                type: "message",
                role: "assistant",
                content: [{ type: part.type, text: part.text }],
                status: "running",
              }),
            ];
          }
        });
      }
      break;
    }

    case "response.output_audio_transcript.delta":
    case "response.audio_transcript.delta": {
      // Streaming transcript text (assistant)
      // delta を新しい content item として追加するのではなく、
      // 先頭の content item に文字列結合することで item 数の肥大化を防ぐ
      const { item_id, delta, output_index } = ev;
      if (output_index === 0 && delta) {
        setItems((prev) => {
          const idx = prev.findIndex((m) => m.id === item_id);
          if (idx >= 0) {
            const updated = [...prev];
            const existingContent = updated[idx].content || [];
            if (existingContent.length > 0) {
              const newContent = [...existingContent];
              newContent[0] = { type: "text", text: (newContent[0].text || "") + delta };
              updated[idx] = { ...updated[idx], content: newContent };
            } else {
              updated[idx] = { ...updated[idx], content: [{ type: "text", text: delta }] };
            }
            return updated;
          } else {
            return [
              ...prev,
              createNewItem({
                id: item_id,
                type: "message",
                role: "assistant",
                content: [{ type: "text", text: delta }],
                status: "running",
              }),
            ];
          }
        });
      }
      break;
    }

    case "response.output_audio_transcript.done":
    case "response.audio_transcript.done": {
      // 音声トランスクリプトの確定イベント: 完成した transcript で content を上書きして完了状態にする
      const { item_id, transcript } = ev;
      if (transcript) {
        updateOrAddItem(item_id, {
          content: [{ type: "text", text: transcript }],
          status: "completed",
        });
      }
      break;
    }

    case "response.output_item.done": {
      const { item } = ev;
      if (item.type === "function_call") {
        // A new function call item
        // Display it in the transcript as an assistant message indicating a function is being requested
        console.log("function_call", item);
        setItems((prev) => [
          ...prev,
          createNewItem({
            ...item,
            role: "assistant",
            content: [
              {
                type: "text",
                text: `${item.name}(${JSON.stringify(
                  JSON.parse(item.arguments)
                )})`,
              },
            ],
            status: "running",
          }),
        ]);
      }
      break;
    }

    default:
      break;
  }
}
