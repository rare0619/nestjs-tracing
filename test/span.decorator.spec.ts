/**
 * @Span() 装饰器单元测试
 */
import { trace, SpanStatusCode, context } from '@opentelemetry/api';
import { Span } from '../src/decorators/span.decorator';

// Mock OTel API
const mockEnd = jest.fn();
const mockRecordException = jest.fn();
const mockSetStatus = jest.fn();

const mockSpan = {
    end: mockEnd,
    recordException: mockRecordException,
    setStatus: mockSetStatus,
    spanContext: () => ({ traceId: 'abc123', spanId: 'def456', traceFlags: 1 }),
};

jest.spyOn(trace, 'getTracer').mockReturnValue({
    startActiveSpan: jest.fn((name: string, fn: (span: any) => any) => fn(mockSpan)),
} as any);

beforeEach(() => {
    jest.clearAllMocks();
});

describe('@Span() decorator', () => {
    it('should create and end span for sync method', () => {
        class TestService {
            @Span('sync-op')
            syncMethod() {
                return 'result';
            }
        }
        const service = new TestService();
        const result = service.syncMethod();

        expect(result).toBe('result');
        expect(mockEnd).toHaveBeenCalledTimes(1);
        expect(mockRecordException).not.toHaveBeenCalled();
    });

    it('should create and end span for async method', async () => {
        class TestService {
            @Span('async-op')
            async asyncMethod() {
                return 'async-result';
            }
        }
        const service = new TestService();
        const result = await service.asyncMethod();

        expect(result).toBe('async-result');
        expect(mockEnd).toHaveBeenCalledTimes(1);
        expect(mockRecordException).not.toHaveBeenCalled();
    });

    it('should record exception and set ERROR status for sync throw', () => {
        const error = new Error('sync-error');
        class TestService {
            @Span('sync-fail')
            failSync() {
                throw error;
            }
        }
        const service = new TestService();

        expect(() => service.failSync()).toThrow('sync-error');
        expect(mockRecordException).toHaveBeenCalledWith(error);
        expect(mockSetStatus).toHaveBeenCalledWith({
            code: SpanStatusCode.ERROR,
            message: 'sync-error',
        });
        expect(mockEnd).toHaveBeenCalledTimes(1);
    });

    it('should record exception and set ERROR status for async rejection', async () => {
        const error = new Error('async-error');
        class TestService {
            @Span('async-fail')
            async failAsync() {
                throw error;
            }
        }
        const service = new TestService();

        await expect(service.failAsync()).rejects.toThrow('async-error');
        expect(mockRecordException).toHaveBeenCalledWith(error);
        expect(mockSetStatus).toHaveBeenCalledWith({
            code: SpanStatusCode.ERROR,
            message: 'async-error',
        });
        expect(mockEnd).toHaveBeenCalledTimes(1);
    });

    it('should use ClassName.methodName as default span name', () => {
        class MyService {
            @Span()
            doWork() {
                return true;
            }
        }
        const service = new MyService();
        service.doWork();

        const tracer = trace.getTracer('@rare0619/nestjs-tracing');
        expect(tracer.startActiveSpan).toHaveBeenCalledWith(
            'MyService.doWork',
            expect.any(Function),
        );
    });

    it('should use custom span name when provided', () => {
        class MyService {
            @Span('custom-name')
            doWork() {
                return true;
            }
        }
        const service = new MyService();
        service.doWork();

        const tracer = trace.getTracer('@rare0619/nestjs-tracing');
        expect(tracer.startActiveSpan).toHaveBeenCalledWith(
            'custom-name',
            expect.any(Function),
        );
    });
});
