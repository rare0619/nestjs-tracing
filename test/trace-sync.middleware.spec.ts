/**
 * TraceSyncMiddleware 单元测试
 */
import { trace } from '@opentelemetry/api';
import { TraceSyncMiddleware } from '../src/middleware/trace-sync.middleware';

beforeEach(() => {
    jest.restoreAllMocks();
});

describe('TraceSyncMiddleware', () => {
    const middleware = new TraceSyncMiddleware();

    function createMockRes() {
        const headers: Record<string, string> = {};
        return {
            header: jest.fn((key: string, val: string) => { headers[key] = val; }),
            _headers: headers,
        };
    }

    it('should set x-request-id and x-trace-id when active span exists', () => {
        const mockSpan = {
            spanContext: () => ({
                traceId: 'aabbccdd11223344aabbccdd11223344',
                spanId: '1122334455667788',
                traceFlags: 1,
            }),
        };
        jest.spyOn(trace, 'getActiveSpan').mockReturnValue(mockSpan as any);

        const req = {} as any;
        const res = createMockRes();
        const next = jest.fn();

        middleware.use(req, res as any, next);

        expect(res.header).toHaveBeenCalledWith('x-request-id', 'aabbccdd11223344aabbccdd11223344');
        expect(res.header).toHaveBeenCalledWith('x-trace-id', 'aabbccdd11223344aabbccdd11223344');
        expect(next).toHaveBeenCalledTimes(1);
    });

    it('should not set headers when no active span', () => {
        jest.spyOn(trace, 'getActiveSpan').mockReturnValue(undefined);

        const req = {} as any;
        const res = createMockRes();
        const next = jest.fn();

        middleware.use(req, res as any, next);

        expect(res.header).not.toHaveBeenCalled();
        expect(next).toHaveBeenCalledTimes(1);
    });

    it('should always call next()', () => {
        jest.spyOn(trace, 'getActiveSpan').mockReturnValue(undefined);

        const next = jest.fn();
        middleware.use({} as any, createMockRes() as any, next);

        expect(next).toHaveBeenCalledTimes(1);
    });
});
