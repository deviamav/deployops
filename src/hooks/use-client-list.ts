"use client";

import { useCallback, useMemo, useState } from "react";
import { matchesSearchTokens, parseSearchTokens } from "@/lib/mass-search";
import { paginateSlice } from "@/components/pagination-bar";

export function useClientList<T>(
  items: T[],
  getHaystack: (item: T) => Array<string | null | undefined>,
  getId: (item: T) => string,
  pageSize = 25,
) {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const tokens = useMemo(() => parseSearchTokens(search), [search]);

  const filtered = useMemo(() => {
    if (tokens.length === 0) return items;
    return items.filter((item) => matchesSearchTokens(getHaystack(item), tokens));
  }, [items, tokens, getHaystack]);

  const total = filtered.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, totalPages);

  const pageItems = useMemo(
    () => paginateSlice(filtered, safePage, pageSize),
    [filtered, safePage, pageSize],
  );

  const allPageSelected =
    pageItems.length > 0 && pageItems.every((i) => selected.has(getId(i)));
  const allFilteredSelected =
    filtered.length > 0 && filtered.every((i) => selected.has(getId(i)));

  const setSearchAndReset = useCallback((v: string) => {
    setSearch(v);
    setPage(1);
  }, []);

  const toggle = useCallback(
    (id: string) => {
      setSelected((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      });
    },
    [],
  );

  const togglePage = useCallback(() => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allPageSelected) pageItems.forEach((i) => next.delete(getId(i)));
      else pageItems.forEach((i) => next.add(getId(i)));
      return next;
    });
  }, [allPageSelected, pageItems, getId]);

  const selectFiltered = useCallback(() => {
    setSelected(new Set(filtered.map(getId)));
  }, [filtered, getId]);

  const clearSelection = useCallback(() => setSelected(new Set()), []);

  const onPasteMass = useCallback(
    (text: string) => {
      const pasted = parseSearchTokens(text);
      if (pasted.length < 2) return false;
      setSearch(pasted.join("\n"));
      setPage(1);
      const matched = items.filter((item) => matchesSearchTokens(getHaystack(item), pasted));
      if (matched.length) setSelected(new Set(matched.map(getId)));
      return true;
    },
    [items, getHaystack, getId],
  );

  return {
    search,
    setSearch: setSearchAndReset,
    tokens,
    filtered,
    pageItems,
    page: safePage,
    setPage,
    pageSize,
    total,
    selected,
    setSelected,
    toggle,
    togglePage,
    selectFiltered,
    clearSelection,
    allPageSelected,
    allFilteredSelected,
    onPasteMass,
    resetSelection: clearSelection,
  };
}
