const MAX_TOOL_TURNS = 5;

async function runChatWithTools({ anthropic, model, system, messages, tools, mcpCallTool, onEvent, isAborted }) {
  const turnMessages = messages.map((m) => ({ ...m }));
  let finalText = '';
  const aborted = () => (typeof isAborted === 'function' ? isAborted() : false);

  for (let turn = 0; turn < MAX_TOOL_TURNS; turn++) {
    if (aborted()) break;
    const createParams = {
      model,
      max_tokens: 4096,
      system,
      messages: turnMessages,
      stream: true
    };
    if (tools && tools.length > 0) {
      createParams.tools = tools;
    }

    const stream = await anthropic.messages.create(createParams);

    const blocksByIndex = {};
    let stopReason = null;

    for await (const event of stream) {
      if (aborted()) return { finalText, finalMessages: turnMessages };
      if (event.type === 'content_block_start') {
        const idx = event.index;
        const cb = event.content_block;
        if (cb.type === 'text') {
          blocksByIndex[idx] = { type: 'text', text: '' };
        } else if (cb.type === 'tool_use') {
          blocksByIndex[idx] = {
            type: 'tool_use',
            id: cb.id,
            name: cb.name,
            inputJson: '',
            input: {}
          };
          onEvent({ type: 'tool_start', name: cb.name, id: cb.id });
        } else {
          blocksByIndex[idx] = { ...cb };
        }
      } else if (event.type === 'content_block_delta') {
        const block = blocksByIndex[event.index];
        if (!block) continue;
        if (event.delta.type === 'text_delta') {
          block.text += event.delta.text;
          onEvent({ type: 'text', text: event.delta.text });
        } else if (event.delta.type === 'input_json_delta') {
          block.inputJson += event.delta.partial_json;
        }
      } else if (event.type === 'content_block_stop') {
        const block = blocksByIndex[event.index];
        if (block && block.type === 'tool_use') {
          try {
            block.input = block.inputJson ? JSON.parse(block.inputJson) : {};
          } catch (e) {
            block.input = {};
          }
        }
      } else if (event.type === 'message_delta') {
        if (event.delta && event.delta.stop_reason) {
          stopReason = event.delta.stop_reason;
        }
      }
    }

    const assistantContent = Object.keys(blocksByIndex)
      .sort((a, b) => Number(a) - Number(b))
      .map((k) => {
        const b = blocksByIndex[k];
        if (b.type === 'tool_use') {
          return { type: 'tool_use', id: b.id, name: b.name, input: b.input };
        }
        if (b.type === 'text') {
          return { type: 'text', text: b.text };
        }
        return b;
      });

    for (const b of assistantContent) {
      if (b.type === 'text') finalText += b.text;
    }

    turnMessages.push({ role: 'assistant', content: assistantContent });

    const toolUses = assistantContent.filter((b) => b.type === 'tool_use');
    if (toolUses.length === 0 || stopReason !== 'tool_use') {
      break;
    }

    const toolResultBlocks = [];
    for (const tu of toolUses) {
      try {
        const result = await mcpCallTool(tu.name, tu.input);
        const textContent = Array.isArray(result.content)
          ? result.content.filter((c) => c.type === 'text').map((c) => c.text).join('\n')
          : '';
        onEvent({ type: 'tool_end', name: tu.name, id: tu.id });
        toolResultBlocks.push({
          type: 'tool_result',
          tool_use_id: tu.id,
          content: textContent || JSON.stringify(result)
        });
      } catch (err) {
        onEvent({ type: 'tool_error', name: tu.name, id: tu.id, message: err.message });
        toolResultBlocks.push({
          type: 'tool_result',
          tool_use_id: tu.id,
          content: `Tool execution failed: ${err.message}`,
          is_error: true
        });
      }
    }

    turnMessages.push({ role: 'user', content: toolResultBlocks });
  }

  return { finalText, finalMessages: turnMessages };
}

module.exports = { runChatWithTools, MAX_TOOL_TURNS };
