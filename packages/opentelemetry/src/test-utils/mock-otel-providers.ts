import type {
  Counter,
  Histogram,
  Meter,
  MeterProvider,
  Span,
  SpanOptions,
  SpanStatus,
  Tracer,
  TracerProvider,
  UpDownCounter,
} from "@opentelemetry/api";

/**
 * Mock implementation of OpenTelemetry Span for testing.
 */
export class MockSpan implements Span {
  public readonly events: Array<
    { name: string; attributes?: Record<string, unknown>; timestamp?: number }
  > = [];
  public readonly attributes: Record<string, unknown> = {};
  public status?: SpanStatus;
  public ended = false;
  public name: string = "";

  spanContext() {
    return {
      traceId: "mock-trace-id",
      spanId: "mock-span-id",
      traceFlags: 1,
    };
  }

  setAttribute(key: string, value: unknown): this {
    this.attributes[key] = value;
    return this;
  }

  setAttributes(attributes: Record<string, unknown>): this {
    Object.assign(this.attributes, attributes);
    return this;
  }

  addEvent(
    name: string,
    attributesOrStartTime?: unknown,
    startTime?: number,
  ): this {
    this.events.push({
      name,
      attributes: typeof attributesOrStartTime === "object" &&
          attributesOrStartTime !== null
        ? attributesOrStartTime as Record<string, unknown>
        : undefined,
      timestamp: typeof attributesOrStartTime === "number"
        ? attributesOrStartTime
        : startTime,
    });
    return this;
  }

  setStatus(status: SpanStatus): this {
    this.status = status;
    return this;
  }

  updateName(name: string): this {
    this.attributes["span.name"] = name;
    return this;
  }

  end(endTime?: number): void {
    this.ended = true;
    if (endTime) {
      this.attributes["span.end_time"] = endTime;
    }
  }

  isRecording(): boolean {
    return !this.ended;
  }

  recordException(exception: unknown, time?: number): void {
    const errorLike = exception as {
      constructor?: { name?: string };
      message?: string;
    };
    this.addEvent("exception", {
      "exception.type": errorLike?.constructor?.name || "unknown",
      "exception.message": errorLike?.message || String(exception),
    }, time);
  }

  addLink(): this {
    return this;
  }

  addLinks(): this {
    return this;
  }
}

/**
 * Mock implementation of OpenTelemetry Tracer for testing.
 */
export class MockTracer implements Tracer {
  public readonly spans: MockSpan[] = [];

  startSpan(name: string, options?: SpanOptions): Span {
    const span = new MockSpan();
    span.name = name;
    span.attributes["span.name"] = name;
    if (options?.kind !== undefined) {
      span.attributes["span.kind"] = options.kind;
    }
    this.spans.push(span);
    return span;
  }

  startActiveSpan<F extends (span: Span) => unknown>(
    name: string,
    fn: F,
  ): ReturnType<F>;
  startActiveSpan<F extends (span: Span) => unknown>(
    name: string,
    options: SpanOptions,
    fn: F,
  ): ReturnType<F>;
  startActiveSpan<F extends (span: Span) => unknown>(
    name: string,
    options: SpanOptions,
    context: unknown,
    fn: F,
  ): ReturnType<F>;
  startActiveSpan<F extends (span: Span) => unknown>(
    name: string,
    optionsOrFn: SpanOptions | F,
    contextOrFn?: unknown | F,
    fn?: F,
  ): ReturnType<F> {
    const actualFn = typeof optionsOrFn === "function"
      ? optionsOrFn
      : typeof contextOrFn === "function"
      ? contextOrFn
      : fn!;
    const span = this.startSpan(
      name,
      typeof optionsOrFn === "object" ? optionsOrFn : undefined,
    );
    return actualFn(span);
  }

  /**
   * Test helper to get the last created span.
   */
  getLastSpan(): MockSpan | undefined {
    return this.spans[this.spans.length - 1];
  }

  /**
   * Test helper to clear all spans.
   */
  clearSpans(): void {
    this.spans.length = 0;
  }
}

/**
 * Mock implementation of OpenTelemetry TracerProvider for testing.
 */
export class MockTracerProvider implements TracerProvider {
  public readonly tracers: MockTracer[] = [];

  getTracer(_name: string, _version?: string): Tracer {
    const tracer = new MockTracer();
    this.tracers.push(tracer);
    return tracer;
  }

  /**
   * Test helper to get all spans from all tracers.
   */
  getAllSpans(): MockSpan[] {
    return this.tracers.flatMap((tracer) => tracer.spans);
  }

  /**
   * Test helper to clear all tracers and spans.
   */
  clear(): void {
    this.tracers.forEach((tracer) => tracer.clearSpans());
    this.tracers.length = 0;
  }
}

/**
 * Base class for mock metric instruments.
 */
abstract class MockMetricInstrument {
  public readonly records: Array<
    { value: number; attributes?: Record<string, unknown> }
  > = [];

  protected record(value: number, attributes?: Record<string, unknown>): void {
    this.records.push({ value, attributes });
  }

  /**
   * Test helper to get total recorded value.
   */
  getTotalValue(): number {
    return this.records.reduce((sum, record) => sum + record.value, 0);
  }

  /**
   * Test helper to clear all records.
   */
  clear(): void {
    this.records.length = 0;
  }
}

/**
 * Mock implementation of OpenTelemetry Counter for testing.
 */
export class MockCounter extends MockMetricInstrument implements Counter {
  add(value: number, attributes?: Record<string, unknown>): void {
    this.record(value, attributes);
  }
}

/**
 * Mock implementation of OpenTelemetry UpDownCounter for testing.
 */
export class MockUpDownCounter extends MockMetricInstrument
  implements UpDownCounter {
  add(value: number, attributes?: Record<string, unknown>): void {
    this.record(value, attributes);
  }
}

/**
 * Mock implementation of OpenTelemetry Histogram for testing.
 */
export class MockHistogram extends MockMetricInstrument implements Histogram {
  override record(value: number, attributes?: Record<string, unknown>): void {
    super.record(value, attributes);
  }
}

/**
 * Mock implementation of OpenTelemetry Meter for testing.
 */
export class MockMeter implements Meter {
  public readonly counters: MockCounter[] = [];
  public readonly upDownCounters: MockUpDownCounter[] = [];
  public readonly histograms: MockHistogram[] = [];

  createCounter(_name: string, _options?: unknown): Counter {
    const counter = new MockCounter();
    this.counters.push(counter);
    return counter;
  }

  createUpDownCounter(_name: string, _options?: unknown): UpDownCounter {
    const upDownCounter = new MockUpDownCounter();
    this.upDownCounters.push(upDownCounter);
    return upDownCounter;
  }

  createHistogram(_name: string, _options?: unknown): Histogram {
    const histogram = new MockHistogram();
    this.histograms.push(histogram);
    return histogram;
  }

  createObservableCounter(_name: string, _options?: unknown): never {
    throw new Error("Observable instruments not implemented in mock");
  }

  createObservableUpDownCounter(_name: string, _options?: unknown): never {
    throw new Error("Observable instruments not implemented in mock");
  }

  createObservableGauge(_name: string, _options?: unknown): never {
    throw new Error("Observable instruments not implemented in mock");
  }

  createGauge(_name: string, _options?: unknown): never {
    throw new Error("Gauge not implemented in mock");
  }

  addBatchObservableCallback(
    _callback: unknown,
    _observables: unknown[],
  ): void {
    throw new Error("Observable instruments not implemented in mock");
  }

  removeBatchObservableCallback(_callback: unknown): void {
    throw new Error("Observable instruments not implemented in mock");
  }

  /**
   * Test helper to clear all metric instruments.
   */
  clear(): void {
    this.counters.forEach((c) => c.clear());
    this.upDownCounters.forEach((c) => c.clear());
    this.histograms.forEach((c) => c.clear());
    this.counters.length = 0;
    this.upDownCounters.length = 0;
    this.histograms.length = 0;
  }
}

/**
 * Mock implementation of OpenTelemetry MeterProvider for testing.
 */
export class MockMeterProvider implements MeterProvider {
  public readonly meters: MockMeter[] = [];

  getMeter(_name: string, _version?: string, _options?: unknown): Meter {
    const meter = new MockMeter();
    this.meters.push(meter);
    return meter;
  }

  /**
   * Test helper to get all metric records from all meters.
   */
  getAllRecords(): Array<
    {
      instrument: string;
      records: Array<{ value: number; attributes?: Record<string, unknown> }>;
    }
  > {
    const allRecords: Array<
      {
        instrument: string;
        records: Array<{ value: number; attributes?: Record<string, unknown> }>;
      }
    > = [];

    this.meters.forEach((meter) => {
      meter.counters.forEach((counter) => {
        allRecords.push({
          instrument: "counter",
          records: [...counter.records],
        });
      });
      meter.upDownCounters.forEach((upDownCounter) => {
        allRecords.push({
          instrument: "upDownCounter",
          records: [...upDownCounter.records],
        });
      });
      meter.histograms.forEach((histogram) => {
        allRecords.push({
          instrument: "histogram",
          records: [...histogram.records],
        });
      });
    });

    return allRecords;
  }

  /**
   * Test helper to clear all meters and their instruments.
   */
  clear(): void {
    this.meters.forEach((meter) => meter.clear());
    this.meters.length = 0;
  }
}
