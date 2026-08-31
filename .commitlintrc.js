module.exports = {
  extends: ['@commitlint/config-conventional'],
  parserPreset: {
    parserOpts: {
      // Keep the repository's existing `✨ feat(scope): subject` style while
      // still exposing type, scope, and subject to the conventional rules.
      headerPattern: /^(?:[^\w\s]+\s*)?([a-z]+)(?:\(([^()\r\n]+)\))?!?:\s*(.+)$/i,
      headerCorrespondence: ['type', 'scope', 'subject'],
    },
  },
  rules: {
    // Long explanatory bullet points are part of the current commit format.
    'body-max-line-length': [0, 'always'],
  },
};
