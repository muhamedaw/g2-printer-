export class CircuitBreaker {
    constructor(name, threshold = 5, timeout = 60000) {
        this.name = name;
        this.threshold = threshold;
        this.timeout = timeout;
        this.failures = 0;
        this.lastFailureTime = 0;
        this.state = 'closed';
    }
    async execute(fn) {
        if (this.state === 'open') {
            if (Date.now() - this.lastFailureTime > this.timeout) {
                this.state = 'half-open';
            }
            else {
                throw new Error(`Circuit breaker OPEN for ${this.name}`);
            }
        }
        try {
            const result = await fn();
            this.onSuccess();
            return result;
        }
        catch (err) {
            this.onFailure();
            throw err;
        }
    }
    isOpen() { return this.state === 'open'; }
    onSuccess() {
        this.failures = 0;
        this.state = 'closed';
    }
    onFailure() {
        this.failures++;
        this.lastFailureTime = Date.now();
        if (this.failures >= this.threshold)
            this.state = 'open';
    }
}
