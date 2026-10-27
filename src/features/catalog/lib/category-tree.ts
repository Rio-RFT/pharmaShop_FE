import type { MedicineCategory } from '@/features/catalog/api/medicines';

export type CategoryNode = MedicineCategory & { children: CategoryNode[] };

export function findCategoryDataIssues(categories: MedicineCategory[]): string[] {
  const ids = new Set(categories.map((category) => category.id));
  const issues: string[] = [];
  for (const category of categories) {
    if (category.parentId && !ids.has(category.parentId)) { issues.push(`Missing parent for category ${category.id}`); continue; }
    const seen = new Set<string>([category.id]); let current = category;
    while (current.parentId) {
      if (seen.has(current.parentId)) { issues.push(`Cycle in category hierarchy at ${category.id}`); break; }
      seen.add(current.parentId);
      const parent = categories.find((candidate) => candidate.id === current.parentId);
      if (!parent) break;
      current = parent;
    }
  }
  return [...new Set(issues)];
}

export function buildCategoryTree(categories: MedicineCategory[]): CategoryNode[] {
  const nodes = new Map(categories.map((category) => [category.id, { ...category, children: [] as CategoryNode[] }]));
  const roots: CategoryNode[] = [];
  const safeParent = new Map<string, string | null>();
  for (const node of nodes.values()) {
    const seen = new Set([node.id]);
    let parentId = node.parentId;
    let parent = parentId ? nodes.get(parentId) : undefined;
    let cyclic = false;
    while (parent) {
      if (seen.has(parent.id)) { cyclic = true; break; }
      seen.add(parent.id);
      parent = parent.parentId ? nodes.get(parent.parentId) : undefined;
    }
    if (cyclic || (parentId && !nodes.has(parentId)) || parentId === node.id) parentId = null;
    safeParent.set(node.id, parentId);
  }
  for (const node of nodes.values()) { const parentId = safeParent.get(node.id); const parent = parentId ? nodes.get(parentId) : undefined; if (parent) parent.children.push(node); else roots.push(node); }
  const sort = (items: CategoryNode[]) => {
    items.sort((a, b) => a.name.localeCompare(b.name, 'vi')); items.forEach((item) => sort(item.children));
  };
  sort(roots);
  return roots;
}

export function findCategoryDescendantIds(categories: MedicineCategory[], id: string): Set<string> {
  const children = new Map<string, string[]>();
  categories.forEach((category) => { if (category.parentId) children.set(category.parentId, [...(children.get(category.parentId) ?? []), category.id]); });
  const result = new Set<string>(); const pending = [...(children.get(id) ?? [])];
  while (pending.length) { const child = pending.pop()!; if (result.has(child) || child === id) continue; result.add(child); pending.push(...(children.get(child) ?? [])); }
  return result;
}

export function getCategoryDepthMap(roots: CategoryNode[]): Map<string, number> {
  const depths = new Map<string, number>(); const pending = roots.map((node) => ({ node, depth: 0 }));
  while (pending.length) { const { node, depth } = pending.pop()!; if (depths.has(node.id)) continue; depths.set(node.id, depth); node.children.forEach((child) => pending.push({ node: child, depth: depth + 1 })); }
  return depths;
}
