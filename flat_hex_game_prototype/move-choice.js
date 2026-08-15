function flatTargetKey(move) {
  return `${move?.target?.q},${move?.target?.r}`;
}

function solidTargetKey(move) {
  if (typeof move?.pointKey === 'string' && move.pointKey) return move.pointKey;
  return `${move?.panelIndex ?? '-'}:${flatTargetKey(move)}`;
}

export function moveChoicesAtTarget(moves, selectedMove, boardShape = 'flat') {
  if (!selectedMove) return [];
  const targetKey = boardShape === 'solid'
    ? solidTargetKey(selectedMove)
    : flatTargetKey(selectedMove);
  const candidates = moves instanceof Map ? [...moves.values()] : [...(moves ?? [])];
  return candidates.filter(move => (boardShape === 'solid'
    ? solidTargetKey(move)
    : flatTargetKey(move)) === targetKey);
}
