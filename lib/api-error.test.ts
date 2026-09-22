import {
  APIConnectionError,
  AuthenticationError,
  InternalServerError,
  RateLimitError,
  TypeSafeError,
  UnprocessableEntityError,
} from '@typesafe-ai/sdk';
import { describe, expect, it } from 'vitest';
import { describeError } from './api-error';

const noHeaders = new Headers();

describe('describeError', () => {
  it('APIキー未設定(素のTypeSafeError)は設定不備として500を返す', () => {
    const result = describeError(new TypeSafeError('missing api key'));
    expect(result.status).toBe(500);
    expect(result.error).toContain('TYPESAFE_API_KEY');
  });

  it('401は設定不備として500を返す', () => {
    const result = describeError(
      new AuthenticationError(401, undefined, noHeaders),
    );
    expect(result.status).toBe(500);
    expect(result.error).toContain('TYPESAFE_API_KEY');
  });

  it('429はそのまま429を返す', () => {
    const result = describeError(new RateLimitError(429, undefined, noHeaders));
    expect(result.status).toBe(429);
    expect(result.error).toContain('しばらく');
    expect(result.error).not.toContain('TYPESAFE_API_KEY');
  });

  it('サーバー側5xxは502を返す', () => {
    const result = describeError(
      new InternalServerError(529, undefined, noHeaders),
    );
    expect(result.status).toBe(502);
    expect(result.error).not.toContain('TYPESAFE_API_KEY');
  });

  it('422は502を返す(設定不備と混同しない)', () => {
    const result = describeError(
      new UnprocessableEntityError(422, undefined, noHeaders),
    );
    expect(result.status).toBe(502);
    expect(result.error).not.toContain('TYPESAFE_API_KEY');
  });

  it('接続エラー・タイムアウトは502を返す', () => {
    const result = describeError(new APIConnectionError('ECONNRESET'));
    expect(result.status).toBe(502);
    expect(result.error).not.toContain('TYPESAFE_API_KEY');
  });

  it('SDK以外の例外は502を返す', () => {
    const result = describeError(new Error('boom'));
    expect(result.status).toBe(502);
    expect(result.error).not.toContain('TYPESAFE_API_KEY');
  });
});
