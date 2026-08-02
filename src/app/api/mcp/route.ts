import { NextResponse } from 'next/server';

import { authenticateMcp } from '@/domain/mcp/auth';
import { callTool, toolList } from '@/domain/mcp/tools';
import { AppError } from '@/lib/errors';
import { logger } from '@/lib/logger';

/**
 * MCP サーバー（F-18）。
 *
 * **別プロセスを立てない。** Next.js の route handler で JSON-RPC を喋る。
 * VPS 同居・3人規模で、常駐を1つ増やす価値がない。
 *
 * **SDK を入れない。** 使うのは `initialize` / `tools/list` / `tools/call` の3つだけで、
 * 素の JSON-RPC で足りる（CLAUDE.md：ライブラリを勝手に足さない）。
 *
 * 認証は `Authorization: Bearer <APIキー>`。鍵ごとにスコープ（read / read_write）と
 * 触れるプロジェクトを絞る。
 *
 *   claude mcp add --transport http atlasquarry https://…/api/mcp \
 *     --header "Authorization: Bearer aq_…"
 */

const PROTOCOL_VERSION = '2024-11-05';

type JsonRpcRequest = { jsonrpc: '2.0'; id?: string | number | null; method: string; params?: unknown };

function rpcResult(id: string | number | null | undefined, result: unknown) {
  return NextResponse.json({ jsonrpc: '2.0', id: id ?? null, result });
}

/** **JSON-RPC のエラーは HTTP 200 で返す。** 500 にすると相手が再試行してしまう。 */
function rpcError(id: string | number | null | undefined, code: number, message: string) {
  return NextResponse.json({ jsonrpc: '2.0', id: id ?? null, error: { code, message } });
}

export async function POST(request: Request) {
  let body: JsonRpcRequest;
  try {
    body = (await request.json()) as JsonRpcRequest;
  } catch {
    return rpcError(null, -32700, 'JSON として読めません');
  }

  if (body?.jsonrpc !== '2.0' || typeof body.method !== 'string') {
    return rpcError(body?.id, -32600, 'JSON-RPC の形式ではありません');
  }

  // 認証は method の前に。**失敗の理由は返さない**
  let auth;
  try {
    auth = await authenticateMcp(request.headers.get('authorization'));
  } catch {
    return NextResponse.json(
      { jsonrpc: '2.0', id: body.id ?? null, error: { code: -32001, message: '認証できません' } },
      { status: 401 },
    );
  }

  const ip = request.headers.get('x-forwarded-for')?.split(',').pop()?.trim() ?? null;

  try {
    switch (body.method) {
      case 'initialize':
        return rpcResult(body.id, {
          protocolVersion: PROTOCOL_VERSION,
          capabilities: { tools: {} },
          serverInfo: { name: 'atlasquarry', version: '0.1.0' },
        });

      case 'notifications/initialized':
        return new NextResponse(null, { status: 204 });

      case 'tools/list':
        return rpcResult(body.id, { tools: toolList() });

      case 'tools/call': {
        const params = (body.params ?? {}) as { name?: string; arguments?: Record<string, unknown> };
        if (!params.name) return rpcError(body.id, -32602, '道具の名前がありません');

        const result = await callTool(auth, params.name, params.arguments ?? {}, ip);
        return rpcResult(body.id, result);
      }

      case 'ping':
        return rpcResult(body.id, {});

      default:
        return rpcError(body.id, -32601, `対応していない method です: ${body.method}`);
    }
  } catch (error) {
    if (error instanceof AppError) {
      // 業務のエラーは「道具の結果」として返す。JSON-RPC のエラーにすると相手が落ちる
      return rpcResult(body.id, {
        isError: true,
        content: [{ type: 'text', text: error.message }],
      });
    }

    // **鍵も本文も出さない。** method と種類だけ
    logger.error('MCP で未処理の例外', {
      method: body.method,
      reason: error instanceof Error ? error.message : 'unknown',
    });
    return rpcError(body.id, -32603, '内部エラーです');
  }
}

/** 疎通確認用。中身は返さない。 */
export async function GET() {
  return NextResponse.json({ name: 'atlasquarry', protocolVersion: PROTOCOL_VERSION });
}
