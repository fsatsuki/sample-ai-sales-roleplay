// Jest setup file
require("@testing-library/jest-dom");

// Mock TextEncoder and TextDecoder for Node.js environment
const { TextEncoder, TextDecoder } = require("util");
global.TextEncoder = TextEncoder;
global.TextDecoder = TextDecoder;

// Mock import.meta.env
process.env.VITE_API_GATEWAY_ENDPOINT = "https://test-api-endpoint.com";

// Mock import.meta
global.import = {
  meta: {
    env: {
      VITE_API_GATEWAY_ENDPOINT: process.env.VITE_API_GATEWAY_ENDPOINT,
      NODE_ENV: "test",
    },
  },
};

// Mock window.matchMedia
Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: jest.fn().mockImplementation((query) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: jest.fn(),
    removeListener: jest.fn(),
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    dispatchEvent: jest.fn(),
  })),
});

// Mock IntersectionObserver
class MockIntersectionObserver {
  constructor(callback) {
    this.callback = callback;
  }
  observe() {
    return null;
  }
  unobserve() {
    return null;
  }
  disconnect() {
    return null;
  }
}

Object.defineProperty(window, "IntersectionObserver", {
  writable: true,
  value: MockIntersectionObserver,
});

// Mock ResizeObserver
class MockResizeObserver {
  constructor(callback) {
    this.callback = callback;
  }
  observe() {
    return null;
  }
  unobserve() {
    return null;
  }
  disconnect() {
    return null;
  }
}

Object.defineProperty(window, "ResizeObserver", {
  writable: true,
  value: MockResizeObserver,
});

// Mock WebGL context
HTMLCanvasElement.prototype.getContext = jest.fn(() => {
  return {
    clearColor: jest.fn(),
    clearDepth: jest.fn(),
    clear: jest.fn(),
    enable: jest.fn(),
    viewport: jest.fn(),
    getExtension: jest.fn(() => null),
    getParameter: jest.fn(() => null),
    getShaderPrecisionFormat: jest.fn(() => ({
      precision: 1,
      rangeMin: 1,
      rangeMax: 1,
    })),
  };
});

// Mock SpeechSynthesis
global.SpeechSynthesisUtterance = class MockSpeechSynthesisUtterance {
  constructor(text) {
    this.text = text;
  }
};

global.speechSynthesis = {
  speak: jest.fn(),
  cancel: jest.fn(),
  pause: jest.fn(),
  resume: jest.fn(),
  getVoices: jest.fn(() => []),
};

// Mock window.confirm
global.confirm = jest.fn(() => true);

// Mock console.error to fail tests on prop type warnings
const originalConsoleError = console.error;
console.error = (...args) => {
  // Check if the error is a prop type warning
  const isPropTypeWarning = args.some(
    (arg) =>
      typeof arg === "string" && arg.includes("Warning: Failed prop type"),
  );

  if (isPropTypeWarning) {
    throw new Error(args.join(" "));
  }

  originalConsoleError(...args);
};
