/**
 * tracer.ts 纯函数单元测试
 *
 * 只测试已 export 的纯函数逻辑，不触发 SDK 初始化（避免依赖 APM Server 连接）
 */

// 禁用 SDK 初始化，只测试纯函数
process.env.OTEL_SDK_DISABLED = 'true';

import {
    detectServiceName,
    buildTracesUrl,
    shouldIgnoreIncoming,
    shouldIgnoreOutgoing,
    getInfraPorts,
    ES_PATH_PREFIXES,
} from '../src/tracer';

describe('detectServiceName()', () => {
    const origEnv = { ...process.env };
    const origArgv = [...process.argv];

    afterEach(() => {
        process.env = { ...origEnv };
        process.argv = [...origArgv];
    });

    it('should prefer OTEL_SERVICE_NAME', () => {
        process.env.OTEL_SERVICE_NAME = 'my-gateway';
        process.env.SERVICE_NAME = 'docker-gw';
        expect(detectServiceName()).toBe('my-gateway');
    });

    it('should fall back to SERVICE_NAME', () => {
        delete process.env.OTEL_SERVICE_NAME;
        process.env.SERVICE_NAME = 'k8s-user-service';
        expect(detectServiceName()).toBe('k8s-user-service');
    });

    it('should infer from NestJS monorepo path', () => {
        delete process.env.OTEL_SERVICE_NAME;
        delete process.env.SERVICE_NAME;
        process.argv[1] = '/app/dist/apps/user-service/main.js';
        expect(detectServiceName()).toBe('user-service');
    });

    it('should infer from Windows path', () => {
        delete process.env.OTEL_SERVICE_NAME;
        delete process.env.SERVICE_NAME;
        process.argv[1] = 'C:\\app\\dist\\apps\\gateway\\main.js';
        expect(detectServiceName()).toBe('gateway');
    });

    it('should return unknown-service as fallback', () => {
        delete process.env.OTEL_SERVICE_NAME;
        delete process.env.SERVICE_NAME;
        process.argv[1] = '/usr/bin/node';
        expect(detectServiceName()).toBe('unknown-service');
    });
});

describe('buildTracesUrl()', () => {
    it('should append /v1/traces to base endpoint', () => {
        expect(buildTracesUrl('http://localhost:4318')).toBe('http://localhost:4318/v1/traces');
    });

    it('should not duplicate /v1/traces', () => {
        expect(buildTracesUrl('http://apm:8200/v1/traces')).toBe('http://apm:8200/v1/traces');
    });

    it('should strip trailing slash', () => {
        expect(buildTracesUrl('http://localhost:4318/')).toBe('http://localhost:4318/v1/traces');
    });

    it('should strip multiple trailing slashes', () => {
        expect(buildTracesUrl('http://localhost:4318///')).toBe('http://localhost:4318/v1/traces');
    });

    it('should default to localhost:4318 when no endpoint', () => {
        expect(buildTracesUrl()).toBe('http://localhost:4318/v1/traces');
        expect(buildTracesUrl(undefined)).toBe('http://localhost:4318/v1/traces');
    });
});

describe('shouldIgnoreIncoming()', () => {
    it('should ignore /health paths', () => {
        expect(shouldIgnoreIncoming('/health')).toBe(true);
        expect(shouldIgnoreIncoming('/api/health')).toBe(true);
        expect(shouldIgnoreIncoming('/health/check')).toBe(true);
    });

    it('should ignore /readiness paths', () => {
        expect(shouldIgnoreIncoming('/readiness')).toBe(true);
        expect(shouldIgnoreIncoming('/api/readiness')).toBe(true);
    });

    it('should not ignore normal API paths', () => {
        expect(shouldIgnoreIncoming('/api/users')).toBe(false);
        expect(shouldIgnoreIncoming('/user/v1/userinfo')).toBe(false);
        expect(shouldIgnoreIncoming('/')).toBe(false);
    });
});

describe('shouldIgnoreOutgoing()', () => {
    it('should ignore by port (ES 9200)', () => {
        expect(shouldIgnoreOutgoing({ port: 9200 })).toBe(true);
        expect(shouldIgnoreOutgoing({ port: '9200' })).toBe(true);
    });

    it('should ignore by port (APM 8200)', () => {
        expect(shouldIgnoreOutgoing({ port: 8200 })).toBe(true);
    });

    it('should ignore by port (OTLP 4317/4318)', () => {
        expect(shouldIgnoreOutgoing({ port: 4317 })).toBe(true);
        expect(shouldIgnoreOutgoing({ port: 4318 })).toBe(true);
    });

    it('should ignore by ES API path prefix', () => {
        expect(shouldIgnoreOutgoing({ path: '/_cluster/health' })).toBe(true);
        expect(shouldIgnoreOutgoing({ path: '/_bulk' })).toBe(true);
        expect(shouldIgnoreOutgoing({ path: '/_template/logs' })).toBe(true);
        expect(shouldIgnoreOutgoing({ path: '/_data_stream/logs' })).toBe(true);
    });

    it('should ignore by href containing :9200 or :8200', () => {
        expect(shouldIgnoreOutgoing({ href: 'http://es-node:9200/_bulk' })).toBe(true);
        expect(shouldIgnoreOutgoing({ hostname: 'http://apm:8200/intake' })).toBe(true);
    });

    it('should NOT ignore normal outgoing requests', () => {
        expect(shouldIgnoreOutgoing({ port: 3011, path: '/api/users/me' })).toBe(false);
        expect(shouldIgnoreOutgoing({ port: 80, path: '/api/data' })).toBe(false);
        expect(shouldIgnoreOutgoing({ href: 'http://user-service:3011/api' })).toBe(false);
    });
});

describe('getInfraPorts()', () => {
    it('should include default ES/APM/OTLP ports', () => {
        const ports = getInfraPorts();
        expect(ports.has(9200)).toBe(true);
        expect(ports.has(8200)).toBe(true);
        expect(ports.has(4317)).toBe(true);
        expect(ports.has(4318)).toBe(true);
    });

    it('should respect ELASTICSEARCH_PORT env', () => {
        const origPort = process.env.ELASTICSEARCH_PORT;
        process.env.ELASTICSEARCH_PORT = '9201';
        const ports = getInfraPorts();
        expect(ports.has(9201)).toBe(true);
        process.env.ELASTICSEARCH_PORT = origPort;
    });
});

describe('ES_PATH_PREFIXES', () => {
    it('should contain expected prefixes', () => {
        expect(ES_PATH_PREFIXES).toContain('/_cluster/');
        expect(ES_PATH_PREFIXES).toContain('/_bulk');
        expect(ES_PATH_PREFIXES).toContain('/_template/');
        expect(ES_PATH_PREFIXES).toContain('/_data_stream/');
    });
});
