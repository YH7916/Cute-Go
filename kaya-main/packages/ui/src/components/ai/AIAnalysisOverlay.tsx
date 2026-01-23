/**
 * AI Analysis Integration Hook
 *
 * Provides AI analysis functionality using ONNX engine
 * Returns heatmap data for board visualization
 *
 * REFACTORED: Logic moved to AIAnalysisContext to allow sharing state across components.
 */

export { useAIAnalysis } from '../../contexts/AIAnalysisContext';
