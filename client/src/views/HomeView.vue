<template>
  <v-container fluid class="fill-height home-container">
    <v-row align="center" justify="center" class="home-grid">
      <v-col cols="12" md="6" lg="5">
        <v-card class="nexus-card" elevation="12">
          <v-card-title class="text-h3 text-center primary--text pa-8">
            SPONG
          </v-card-title>
          <v-card-subtitle class="text-center text-h6 pb-4">
            Multiplayer Game
          </v-card-subtitle>
          <v-card-actions class="pa-6">
            <v-btn
              block
              color="primary"
              size="x-large"
              variant="flat"
              @click="createLobby"
            >
              <v-icon start>mdi-plus</v-icon>
              Create Lobby
            </v-btn>
          </v-card-actions>

          <v-divider class="mx-6"></v-divider>

          <v-card-text class="pt-4">
            <v-text-field
              v-model="roomId"
              label="Room ID"
              variant="outlined"
              color="primary"
              prepend-inner-icon="mdi-door"
              hint="Enter a room ID to join an existing lobby"
              persistent-hint
            />
          </v-card-text>
          <v-card-actions class="pa-6 pt-0">
            <v-btn
              block
              color="secondary"
              size="large"
              variant="outlined"
              @click="joinGame"
              :disabled="!roomId"
            >
              <v-icon start>mdi-login</v-icon>
              Join Existing Lobby
            </v-btn>
          </v-card-actions>

          <v-divider class="mx-6 my-2"></v-divider>

          <v-card-text class="text-center py-4">
            <v-btn
              variant="outlined"
              color="primary"
              size="large"
              @click="quickPlay"
            >
              <v-icon start>mdi-lightning-bolt</v-icon>
              Quick Play (Skip Lobby)
            </v-btn>
          </v-card-text>
          
          <v-divider class="mx-6 my-2"></v-divider>
          
          <v-card-text class="text-center">
            <v-btn
              variant="outlined"
              color="primary"
              @click="router.push('/shootingRange')"
              class="mx-2"
            >
              <v-icon start>mdi-target</v-icon>
              Shooting Range
            </v-btn>
            <v-btn
              variant="outlined"
              color="secondary"
              @click="router.push('/builder')"
              class="mx-2"
            >
              <v-icon start>mdi-cube-outline</v-icon>
              Builder
            </v-btn>
          </v-card-text>
        </v-card>
      </v-col>
      <v-col cols="12" md="6" lg="5">
        <v-card class="devlog-card" elevation="10">
          <v-card-title class="text-h4 text-center devlog-title pa-6">
            Dev Log
          </v-card-title>
          <v-card-subtitle class="text-center pb-2 devlog-subtitle">
            Short updates, high signal
          </v-card-subtitle>
          <v-card-text class="devlog-body">
            <v-list class="devlog-list" density="compact">
              <v-list-item
                v-for="(entry, index) in devLog"
                :key="entry.date"
                class="devlog-item"
                :style="{ '--delay': `${index * 90}ms` }"
              >
                <template #prepend>
                  <v-chip size="small" color="accent" variant="outlined">
                    {{ entry.date }}
                  </v-chip>
                </template>
                <v-list-item-title class="text-subtitle-1 font-weight-medium">
                  {{ entry.title }}
                </v-list-item-title>
                <v-list-item-subtitle>
                  {{ entry.summary }}
                </v-list-item-subtitle>
                <div class="devlog-tags">
                  <v-chip
                    v-for="tag in entry.tags"
                    :key="tag"
                    size="x-small"
                    color="primary"
                    variant="tonal"
                  >
                    {{ tag }}
                  </v-chip>
                </div>
              </v-list-item>
            </v-list>
          </v-card-text>
        </v-card>
      </v-col>
    </v-row>
  </v-container>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import devLogRaw from '../content/devlog.md?raw';

const router = useRouter();
const roomId = ref('');

const createLobby = () => {
  const uniqueRoomId = `lobby_${Math.random().toString(36).substring(2, 15)}`;
  router.push({ name: 'game', query: { room: uniqueRoomId } });
};

const joinGame = () => {
  if (!roomId.value.trim()) return;
  router.push({ name: 'game', query: { room: roomId.value } });
};

const quickPlay = () => {
  const randomSeed = Math.random().toString(36).substring(2, 15);
  router.push({ name: 'level', query: { seed: randomSeed } });
};

type DevLogEntry = {
  date: string;
  title: string;
  summary: string;
  tags: string[];
};

const parseDevLog = (raw: string): DevLogEntry[] => {
  const sections = raw.split(/^##\s+/gm).slice(1);

  return sections
    .map((section) => {
      const lines = section
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line.length > 0);

      const header = lines.shift() ?? '';
      const [datePart, titlePart] = header.split('|').map((part) => part.trim());
      const summary = lines.find((line) => !/^tags:/i.test(line)) ?? '';
      const tagsLine = lines.find((line) => /^tags:/i.test(line)) ?? '';
      const tags = tagsLine
        .replace(/^tags:\s*/i, '')
        .split(',')
        .map((tag) => tag.trim())
        .filter((tag) => tag.length > 0);

      return {
        date: datePart,
        title: titlePart || '',
        summary,
        tags
      };
    })
    .filter((entry) => entry.date && entry.title && entry.summary);
};

const devLog = parseDevLog(devLogRaw);
</script>

<style scoped>
.home-container {
  --nexus-deep: #0a0f1f;
  --nexus-reef: #0f2a2b;
  --nexus-glow: #00f5d4;
  --nexus-ember: #ffb703;
  --nexus-card: rgba(16, 22, 38, 0.95);
  background: linear-gradient(135deg, var(--nexus-deep) 0%, var(--nexus-reef) 100%);
  position: relative;
  overflow: hidden;
}

.home-container::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: 
    radial-gradient(circle at 18% 45%, rgba(0, 245, 212, 0.12) 0%, transparent 55%),
    radial-gradient(circle at 82% 55%, rgba(255, 183, 3, 0.12) 0%, transparent 55%);
  pointer-events: none;
}

.nexus-card {
  background: var(--nexus-card) !important;
  border: 1px solid rgba(0, 245, 212, 0.3);
  box-shadow: 0 0 30px rgba(0, 245, 212, 0.18);
}

.home-grid {
  gap: 12px;
}

.devlog-card {
  background: rgba(12, 18, 34, 0.92) !important;
  border: 1px solid rgba(255, 183, 3, 0.35);
  box-shadow: 0 18px 40px rgba(12, 18, 34, 0.4);
  animation: devlog-rise 700ms ease-out both;
}

.devlog-title {
  color: var(--nexus-ember);
  letter-spacing: 0.04em;
}

.devlog-subtitle {
  color: rgba(224, 248, 242, 0.7);
}

.devlog-body {
  padding-top: 0;
}

.devlog-list {
  background: transparent;
}

.devlog-item {
  border-radius: 12px;
  padding: 12px 8px;
  margin-bottom: 8px;
  background: rgba(10, 15, 31, 0.6);
  animation: devlog-fade 520ms ease-out both;
  animation-delay: var(--delay, 0ms);
}

.devlog-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 8px;
}

@keyframes devlog-rise {
  from {
    transform: translateY(18px);
    opacity: 0;
  }
  to {
    transform: translateY(0);
    opacity: 1;
  }
}

@keyframes devlog-fade {
  from {
    transform: translateY(10px);
    opacity: 0;
  }
  to {
    transform: translateY(0);
    opacity: 1;
  }
}
</style>
