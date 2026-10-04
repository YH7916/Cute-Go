import type * as ort from 'onnxruntime-web';

function floatOutput(results: ort.InferenceSession.OnnxValueMapType, name: string, shape: number[]) {
    const tensor = results[name];
    if (!tensor || tensor.type !== 'float32' || !(tensor.data instanceof Float32Array)
        || tensor.dims.length !== shape.length || tensor.dims.some((dim, index) => dim !== shape[index])) {
        throw new Error(`Invalid model output ${name}: expected float32 [${shape.join(',')}]`);
    }
    if (tensor.data.some(value => !Number.isFinite(value))) {
        throw new Error(`Invalid model output ${name}: non-finite value`);
    }
    return tensor.data;
}

export function readModelOutputs(results: ort.InferenceSession.OnnxValueMapType, size: number) {
    // These are the contracts of the bundled kata_dynamic.onnx, including its pass logit.
    return {
        policy: floatOutput(results, 'output_policy', [1, size * size + 1]),
        value: floatOutput(results, 'output_value', [1, 3]),
        misc: floatOutput(results, 'output_miscvalue', [1, 4]),
        ownership: results.output_ownership ? floatOutput(results, 'output_ownership', [1, 1, size, size]) : null,
    };
}

export function processWinrate(value: Float32Array): number {
    const max = Math.max(...value);
    const weights = Array.from(value, logit => Math.exp(logit - max));
    return 100 * weights[0] / weights.reduce((sum, weight) => sum + weight, 0);
}

// The bundled graph ends at conv_ownership/Conv and exports pretanh logits.
// KataGo v1.12.4 cpp/neuralnet/nneval.cpp:961-976 applies tanh before changing
// the side-to-play perspective. Our consumers use black-positive ownership.
export function normalizeOwnership(raw: Float32Array | null, color: 1 | -1): Float32Array | null {
    return raw ? Float32Array.from(raw, value => Math.tanh(value) * color) : null;
}
