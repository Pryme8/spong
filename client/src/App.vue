<template>
  <v-app>
    <router-view />
    <div class="app-version">v{{ appVersion }}</div>
  </v-app>
</template>

<script setup lang="ts">
const appVersion = __APP_VERSION__;
</script>

<style>
html, body {
  margin: 0;
  padding: 0;
  width: 100%;
  height: 100%;
  overflow: hidden;
}

#app {
  width: 100%;
  height: 100%;
}

.app-version {
  position: fixed;
  bottom: 4px;
  right: 8px;
  font-size: 10px;
  opacity: 0.5;
  pointer-events: none;
  font-family: monospace;
}
</style>
