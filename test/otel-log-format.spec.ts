/**
 * otelLogFormat winston format 单元测试
 */
import { trace, context } from '@opentelemetry/api';

// 导入被测模块前需要先初始化 winston，因为 otelLogFormat 依赖 winston.format
import { otelLogFormat } from '../src/winston/otel-log-format';

beforeEach(() => {
    jest.restoreAllMocks();
});

describe('otelLogFormat()', () => {
    it('should inject trace.id/span.id/trace.flags when active span exists', () => {
        const mockSpan = {
            spanContext: () => ({
                traceId: 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4',
                spanId: '1234567890abcdef',
                traceFlags: 1,
            }),
        };
        jest.spyOn(trace, 'getSpan').mockReturnValue(mockSpan as any);

        const format = otelLogFormat();
        const info = { level: 'info', message: 'test' };
        const result = format.transform(info, {});

        expect(result).toBeTruthy();
        expect((result as any)['trace.id']).toBe('a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4');
        expect((result as any)['span.id']).toBe('1234567890abcdef');
        expect((result as any)['trace.flags']).toBe(1);
    });

    it('should not inject fields when no active span', () => {
        jest.spyOn(trace, 'getSpan').mockReturnValue(undefined);

        const format = otelLogFormat();
        const info = { level: 'info', message: 'test' };
        const result = format.transform(info, {});

        expect(result).toBeTruthy();
        expect((result as any)['trace.id']).toBeUndefined();
        expect((result as any)['span.id']).toBeUndefined();
        expect((result as any)['trace.flags']).toBeUndefined();
    });

    it('should produce 32-hex trace.id format', () => {
        const mockSpan = {
            spanContext: () => ({
                traceId: '8dbf21cb6370d54a6b6fc10b574846be',
                spanId: 'abcdef0123456789',
                traceFlags: 0,
            }),
        };
        jest.spyOn(trace, 'getSpan').mockReturnValue(mockSpan as any);

        const format = otelLogFormat();
        const result = format.transform({ level: 'debug', message: 'x' }, {});

        const traceId = (result as any)['trace.id'];
        expect(traceId).toMatch(/^[0-9a-f]{32}$/);
    });
});
