import { createApp } from 'vue';
import { createVuetify } from 'vuetify';
import * as components from 'vuetify/components';
import * as directives from 'vuetify/directives';
import { aliases, mdi } from 'vuetify/iconsets/mdi';
import '@mdi/font/css/materialdesignicons.css';
import 'vuetify/styles';
import App from './App.vue';
import router from './router';

// Nexus theme configuration
const nexusTheme = {
  dark: true,
  colors: {
    background: '#0a0a1a',
    surface: '#141432',
    primary: '#00ff88',
    secondary: '#7c4dff',
    accent: '#00e5ff',
    error: '#ff1744',
    warning: '#ffab00',
    info: '#00e5ff',
    success: '#00ff88',
    'on-background': '#e0e0ff',
    'on-surface': '#e0e0ff',
    'on-primary': '#0a0a1a',
    'on-secondary': '#e0e0ff',
    'on-accent': '#0a0a1a',
    'on-error': '#ffffff',
  }
};

const vuetify = createVuetify({
  components,
  directives,
  theme: {
    defaultTheme: 'nexus',
    themes: {
      nexus: nexusTheme
    }
  },
  icons: {
    defaultSet: 'mdi',
    aliases,
    sets: {
      mdi
    }
  }
});

const app = createApp(App);
app.use(router);
app.use(vuetify);
app.mount('#app');
