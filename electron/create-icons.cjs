/**
 * Generate tray icon PNGs for macOS menubar
 * Run: node electron/create-icons.cjs
 */
const fs = require('fs');
const path = require('path');

// 16x16 Book icon as a minimal 1-bit bitmap encoded in base64 PNG
// Generated from a simplified open book shape

// Normal icon (book outline)
const ICON_NORMAL_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAABAAAAASCAYAAABSO15qAAAABHNCSVQICAgIfAhkiAAAAAlwSFlzAAAAbwAAAG8B8aLcQwAAABl0RVh0U29mdHdhcmUAd3d3Lmlua3NjYXBlLm9yZ5vuPBoAAADlSURBVDiN3ZKxDcIwEEX/OQUFLRAWYARqJmAExmAENmCEbMAIjMAIbgSKFMjhxHEcCgpe8X3/+e78ARpiPpWnLuIa8A2MgJsrEskNEgDsqp3MltkW4CJCfgZ4zqLB6CAl5jmA9MjxXBJ4AjCGHh2AmcnR7AvwuIpvACcxjAH00RfA4waM10BDAnTfBNYALfJFyCnBHyHevEEJC0k7cJ36x7IJB/9rFKZ2bQN8WK0lLQASatSf1QqBfS8N3aZvd3KZJGE45i4ZHYPzTe/G/FGzrkyMCkAlqczWQPXqK0Q5pvBF1Qi5XRZRNvxAAAAAElFTkSuQmCC';

// Badge icon (book with red dot)
const ICON_BADGE_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAABAAAAASCAYAAABSO15qAAAABHNCSVQICAgIfAhkiAAAAAlwSFlzAAAAbwAAAG8B8aLcQwAAABl0RVh0U29mdHdhcmUAd3d3Lmlua3NjYXBlLm9yZ5vuPBoAAAEYSURBVDiN1ZIxTsNAEEX/rK0UIKVgCQ0X4Ai0nIAjcAzOwAk4AkfgBByBI9AWkSghSuwk3l2GYuPEMYmgoOBVszP/z+zsAn+N+VSeuohrwDeQA25vSSQ3SADYVTuZLbMtwF0M+RngOYsHYwcv4cMjTw+8dAQR4AF4cQJnJ0fAArhxAmcnR7AvwCKl9AdwEnPfAIcGji6AUwL/m8ACuEu+ADklcCf0ixOQtJW0Dd+texAT+Nm/etVkZtM2xIvRStJCJK1K/TVXKRj7NNbs7VYmkzgc55csr575Zuzn343YIHdbG5gUQMup2VyB7NVjlIYU3wz6oFIroud9McsYi6YcJ+Qs6eqXz434y85kEsjlAFqezmQPXqK0Q5pvBF+C4MHFWLR/AAAAABJRU5ErkJggg==';

// Write the PNG files
fs.writeFileSync(
    path.join(__dirname, 'tray-iconTemplate.png'),
    Buffer.from(ICON_NORMAL_BASE64, 'base64')
);

fs.writeFileSync(
    path.join(__dirname, 'tray-icon-badge.png'),
    Buffer.from(ICON_BADGE_BASE64, 'base64')
);

console.log('Tray icons created successfully!');
