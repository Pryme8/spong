import { createRouter, createWebHistory } from 'vue-router';

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      name: 'home',
      component: () => import('../views/HomeView.vue')
    },
    {
      path: '/game',
      name: 'game',
      component: () => import('../views/GameRouteView.vue')
    },
    {
      path: '/level/',
      name: 'level',
      component: () => import('../views/GameView.vue')
    },
    {
      path: '/tree/',
      name: 'tree',
      component: () => import('../views/TreeView.vue')
    },
    {
      path: '/cloud/',
      name: 'cloud',
      component: () => import('../views/CloudView.vue')
    },
    {
      path: '/rock/',
      name: 'rock',
      component: () => import('../views/RockView.vue')
    },
    {
      path: '/bush/',
      name: 'bush',
      component: () => import('../views/BushView.vue')
    },
    {
      path: '/shootingRange',
      name: 'shootingRange',
      component: () => import('../views/ShootingRangeView.vue')
    },
    {
      path: '/builder',
      name: 'builder',
      component: () => import('../views/BuilderView.vue')
    },
    {
      path: '/armory',
      name: 'armory',
      component: () => import('../views/ArmoryView.vue')
    }
  ]
});

export default router;
