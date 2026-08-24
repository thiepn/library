const explicitId = /\s*\{#([A-Za-z][A-Za-z0-9_.:-]*)\}\s*$/;

function applyExplicitId(node) {
  if (node?.type !== 'heading' || !Array.isArray(node.children) || node.children.length === 0) return;

  const last = node.children[node.children.length - 1];
  if (last?.type !== 'text' || typeof last.value !== 'string') return;

  const match = explicitId.exec(last.value);
  if (!match) return;

  last.value = last.value.slice(0, match.index).trimEnd();
  if (last.value === '') node.children.pop();

  node.data ??= {};
  node.data.hProperties ??= {};
  node.data.hProperties.id = match[1];
}

function walk(node) {
  if (!node || typeof node !== 'object') return;
  applyExplicitId(node);
  if (!Array.isArray(node.children)) return;
  for (const child of node.children) walk(child);
}

export default function remarkExplicitHeadingIds() {
  return (tree) => walk(tree);
}
