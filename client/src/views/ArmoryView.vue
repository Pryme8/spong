<template>
  <div class="armory-page">
    <header class="armory-header">
      <div>
        <p class="eyebrow">Armory</p>
        <h1>Weapon Stats Console</h1>
        <p class="subhead">Sort every weapon by any stat and visualize one stat as a horizontal bar chart.</p>
      </div>
      <div class="legend">
        <div class="legend-item">
          <span class="legend-dot"></span>
          <span>Bar length equals stat value</span>
        </div>
        <div class="legend-item">
          <span class="legend-dot muted"></span>
          <span>Missing stats show as n/a</span>
        </div>
      </div>
    </header>

    <section class="controls">
      <div class="control">
        <label for="sortKey">Sort by</label>
        <select id="sortKey" v-model="sortKey">
          <option v-for="key in statKeys" :key="key" :value="key">{{ statLabels[key] }}</option>
        </select>
      </div>

      <div class="control">
        <label>Order</label>
        <div class="segmented">
          <button
            type="button"
            :class="{ active: sortOrder === 'asc' }"
            @click="sortOrder = 'asc'"
          >
            Ascending
          </button>
          <button
            type="button"
            :class="{ active: sortOrder === 'desc' }"
            @click="sortOrder = 'desc'"
          >
            Descending
          </button>
        </div>
      </div>

      <div class="control">
        <label for="chartKey">Chart stat</label>
        <select id="chartKey" v-model="chartKey">
          <option v-for="key in statKeys" :key="key" :value="key">{{ statLabels[key] }}</option>
        </select>
      </div>
    </section>

    <section class="content">
      <div class="table-card">
        <div class="card-header">
          <h2>All Stats</h2>
          <p>{{ sortedWeapons.length }} weapons</p>
        </div>
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Weapon</th>
                <th v-for="key in statKeys" :key="key">
                  <button
                    type="button"
                    class="sort-header"
                    :class="{ active: sortKey === key }"
                    @click="toggleSort(key)"
                  >
                    {{ statLabels[key] }}
                    <span class="sort-indicator">{{ sortIndicator(key) }}</span>
                  </button>
                </th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="weapon in sortedWeapons" :key="weapon.name">
                <td class="weapon-name">{{ formatWeaponName(weapon.name) }}</td>
                <td v-for="key in statKeys" :key="key">
                  {{ formatStat(key, getStatValue(weapon.stats, key)) }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div class="chart-card">
        <div class="card-header">
          <h2>Stat Bar Chart</h2>
          <p>{{ statLabels[chartKey] }} scale</p>
        </div>
        <div class="axis">
          <span v-for="tick in chartTicks" :key="tick">{{ formatTick(tick) }}</span>
        </div>
        <div class="chart">
          <div v-for="row in chartRows" :key="row.name" class="chart-row">
            <div class="weapon-label">{{ formatWeaponName(row.name) }}</div>
            <div class="bar-track">
              <div
                class="bar-fill"
                :class="{ muted: row.value === null }"
                :style="{ width: barWidth(row.value) }"
              ></div>
              <span class="bar-value">
                {{ formatStat(chartKey, row.value) }}
              </span>
            </div>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { WEAPON_STATS, type WeaponStats, type WeaponType } from '@spong/shared';

type StatKey = keyof WeaponStats;

type WeaponRow = {
  name: WeaponType;
  stats: WeaponStats;
};

const statKeys: StatKey[] = [
  'damage',
  'fireRate',
  'accuracy',
  'projectileSpeed',
  'gravityStartDistance',
  'ammo',
  'capacity',
  'reloadTime',
  'pelletsPerShot',
  'proximityRadius',
  'zoomFactor'
];

const statLabels: Record<StatKey, string> = {
  damage: 'Damage',
  fireRate: 'Fire Rate',
  accuracy: 'Accuracy',
  projectileSpeed: 'Projectile Speed',
  gravityStartDistance: 'Gravity Start',
  ammo: 'Ammo',
  capacity: 'Capacity',
  reloadTime: 'Reload Time',
  pelletsPerShot: 'Pellets',
  proximityRadius: 'Proximity Radius',
  zoomFactor: 'Zoom'
};

const sortKey = ref<StatKey>('damage');
const sortOrder = ref<'asc' | 'desc'>('desc');
const chartKey = ref<StatKey>('damage');

watch(sortKey, (value) => {
  if (chartKey.value !== value) {
    chartKey.value = value;
  }
});

watch(chartKey, (value) => {
  if (sortKey.value !== value) {
    sortKey.value = value;
  }
});

const weapons = computed<WeaponRow[]>(() =>
  (Object.keys(WEAPON_STATS) as WeaponType[]).map((name) => ({
    name,
    stats: WEAPON_STATS[name]
  }))
);

const sortedWeapons = computed<WeaponRow[]>(() => {
  const rows = [...weapons.value];
  rows.sort((a, b) => compareStat(a.stats, b.stats, sortKey.value, sortOrder.value));
  return rows;
});

const chartRows = computed(() =>
  sortedWeapons.value.map((weapon) => ({
    name: weapon.name,
    value: getStatValue(weapon.stats, chartKey.value)
  }))
);

const chartMax = computed(() => {
  const values = sortedWeapons.value
    .map((weapon) => getStatValue(weapon.stats, chartKey.value))
    .filter((value): value is number => value !== null);
  return values.length === 0 ? 1 : Math.max(...values);
});

const chartTicks = computed(() => {
  const max = chartMax.value;
  return [0, max * 0.25, max * 0.5, max * 0.75, max];
});

function getStatValue(stats: WeaponStats, key: StatKey): number | null {
  const value = stats[key];
  return typeof value === 'number' ? value : null;
}

function compareStat(
  a: WeaponStats,
  b: WeaponStats,
  key: StatKey,
  order: 'asc' | 'desc'
): number {
  const aVal = getStatValue(a, key);
  const bVal = getStatValue(b, key);

  if (aVal === null && bVal === null) return 0;
  if (aVal === null) return 1;
  if (bVal === null) return -1;

  return order === 'asc' ? aVal - bVal : bVal - aVal;
}

function barWidth(value: number | null): string {
  if (value === null) return '0%';
  const max = chartMax.value || 1;
  return `${Math.min((value / max) * 100, 100)}%`;
}

function toggleSort(key: StatKey): void {
  if (sortKey.value === key) {
    sortOrder.value = sortOrder.value === 'asc' ? 'desc' : 'asc';
    return;
  }

  sortKey.value = key;
  sortOrder.value = 'desc';
}

function sortIndicator(key: StatKey): string {
  if (sortKey.value !== key) return '';
  return sortOrder.value === 'asc' ? '^' : 'v';
}

function formatWeaponName(name: string): string {
  return name.toUpperCase();
}

function formatTick(value: number): string {
  return formatNumber(value);
}

function formatStat(key: StatKey, value: number | null): string {
  if (value === null) return 'n/a';

  if (key === 'accuracy') return value.toFixed(3);
  if (key === 'fireRate') return value.toFixed(1);
  if (key === 'reloadTime') return `${value.toFixed(1)}s`;

  return formatNumber(value);
}

function formatNumber(value: number): string {
  if (Number.isInteger(value)) return value.toString();
  if (Math.abs(value) < 1) return value.toFixed(3);
  return value.toFixed(2);
}
</script>

<style scoped>
@import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;600;700&family=IBM+Plex+Mono:wght@400;600&display=swap');

.armory-page {
  --paper: #f5efe7;
  --ink: #1d1a16;
  --accent: #d66b2d;
  --accent-dark: #8e3d12;
  --muted: #6d6356;
  --line: rgba(0, 0, 0, 0.1);
  --bar: #2d6b7a;
  --bar-muted: #b7aea2;
  min-height: 100vh;
  padding: 32px clamp(20px, 4vw, 56px) 48px;
  font-family: 'Space Grotesk', sans-serif;
  color: var(--ink);
  background:
    radial-gradient(circle at top left, rgba(214, 107, 45, 0.14), transparent 55%),
    radial-gradient(circle at bottom right, rgba(45, 107, 122, 0.18), transparent 50%),
    linear-gradient(140deg, #fef7ec 0%, #f2efe8 60%, #eadfd4 100%);
  background-attachment: fixed;
}

.armory-page::before {
  content: '';
  position: fixed;
  inset: 0;
  background-image: repeating-linear-gradient(
    45deg,
    rgba(0, 0, 0, 0.02) 0,
    rgba(0, 0, 0, 0.02) 1px,
    transparent 1px,
    transparent 8px
  );
  pointer-events: none;
  z-index: 0;
}

.armory-header,
.controls,
.content {
  position: relative;
  z-index: 1;
}

.armory-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  gap: 24px;
  flex-wrap: wrap;
  margin-bottom: 32px;
}

.eyebrow {
  text-transform: uppercase;
  letter-spacing: 0.2em;
  font-size: 0.75rem;
  color: var(--accent-dark);
  margin: 0 0 8px;
}

h1 {
  font-size: clamp(2rem, 3vw, 3rem);
  margin: 0;
}

.subhead {
  margin: 12px 0 0;
  color: var(--muted);
  max-width: 520px;
}

.legend {
  display: grid;
  gap: 8px;
  font-size: 0.9rem;
  color: var(--muted);
}

.legend-item {
  display: flex;
  align-items: center;
  gap: 8px;
}

.legend-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: var(--bar);
}

.legend-dot.muted {
  background: var(--bar-muted);
}

.controls {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 20px;
  background: rgba(255, 255, 255, 0.7);
  border: 1px solid var(--line);
  border-radius: 16px;
  padding: 20px;
  box-shadow: 0 12px 30px rgba(29, 26, 22, 0.08);
  margin-bottom: 28px;
}

.control label {
  display: block;
  font-weight: 600;
  margin-bottom: 8px;
}

.control select {
  width: 100%;
  padding: 10px 12px;
  border-radius: 12px;
  border: 1px solid var(--line);
  background: #fffdf7;
  font-size: 0.95rem;
  color: var(--ink);
}

.control select option {
  color: var(--ink);
}

.segmented {
  display: flex;
  gap: 8px;
}

.segmented button {
  flex: 1;
  padding: 10px 12px;
  border-radius: 999px;
  border: 1px solid var(--line);
  background: transparent;
  font-weight: 600;
  cursor: pointer;
  transition: 0.2s ease;
}

.segmented button.active {
  background: var(--accent);
  color: #fff;
  border-color: transparent;
}

.segmented button:hover {
  border-color: var(--accent);
}

.content {
  display: grid;
  grid-template-columns: minmax(320px, 1.1fr) minmax(280px, 0.9fr);
  gap: 24px;
}

@media (max-width: 980px) {
  .content {
    grid-template-columns: 1fr;
  }
}

.table-card,
.chart-card {
  background: rgba(255, 255, 255, 0.78);
  border: 1px solid var(--line);
  border-radius: 20px;
  padding: 20px;
  box-shadow: 0 12px 24px rgba(29, 26, 22, 0.08);
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  margin-bottom: 16px;
}

.card-header h2 {
  margin: 0;
}

.card-header p {
  margin: 0;
  color: var(--muted);
}

.table-wrap {
  overflow: auto;
  max-height: 60vh;
}

.table-wrap table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.9rem;
}

.table-wrap th,
.table-wrap td {
  padding: 10px 12px;
  text-align: left;
  border-bottom: 1px solid var(--line);
}

.table-wrap th {
  position: sticky;
  top: 0;
  background: #fffdf7;
  z-index: 1;
}

.sort-header {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  border: none;
  background: transparent;
  padding: 0;
  font: inherit;
  color: var(--ink);
  cursor: pointer;
}

.sort-header.active {
  color: var(--accent-dark);
}

.sort-indicator {
  font-size: 0.75rem;
  color: var(--muted);
  min-width: 10px;
}

.table-wrap td.weapon-name {
  font-family: 'IBM Plex Mono', monospace;
  font-weight: 600;
}

.axis {
  display: flex;
  justify-content: space-between;
  font-size: 0.8rem;
  color: var(--muted);
  margin: 6px 0 16px;
}

.chart {
  display: grid;
  gap: 12px;
}

.chart-row {
  display: grid;
  grid-template-columns: 120px 1fr;
  gap: 12px;
  align-items: center;
}

.weapon-label {
  font-family: 'IBM Plex Mono', monospace;
  font-size: 0.85rem;
  text-transform: uppercase;
}

.bar-track {
  position: relative;
  height: 36px;
  background: rgba(45, 107, 122, 0.08);
  border-radius: 999px;
  overflow: hidden;
  display: flex;
  align-items: center;
}

.bar-fill {
  height: 100%;
  background: linear-gradient(90deg, var(--bar), var(--accent));
  border-radius: 999px;
  transition: width 0.3s ease;
}

.bar-fill.muted {
  background: var(--bar-muted);
}

.bar-value {
  position: absolute;
  right: 12px;
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--ink);
}
</style>
