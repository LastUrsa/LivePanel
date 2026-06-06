package modules

import "sort"

func sortedModules(items map[string]Module) []Module {
	out := make([]Module, 0, len(items))
	for _, module := range items {
		out = append(out, module)
	}
	sort.Slice(out, func(i, j int) bool {
		return out[i].Name < out[j].Name
	})
	return out
}
