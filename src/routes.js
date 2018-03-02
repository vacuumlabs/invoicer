export const shortNames = {}

export function store(value) {
  const id = Math.random().toString(36).substring(7)
  shortNames[id] = value
  return id
}

export const routes = {
  actions: '/actions',
  invoice: '/invoice/',
}
