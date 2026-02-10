import { Scene, KeyboardEventTypes, KeyboardInfo, PointerEventTypes } from '@babylonjs/core';

export type InputStateChangeCallback = (forward: number, right: number, jump: boolean, sprint: boolean) => void;
export type ShootCallback = () => void;
export type DropCallback = () => void;
export type ReloadCallback = () => void;
export type PickupCallback = () => void;
export type ZoomCallback = (isZooming: boolean) => void;

export class InputManager {
  private keys = new Map<string, boolean>();
  private scene: Scene;
  private onStateChangeCallback: InputStateChangeCallback | null = null;
  private onShootCallback: ShootCallback | null = null;
  private onDropCallback: DropCallback | null = null;
  private onReloadCallback: ReloadCallback | null = null;
  private onPickupCallback: PickupCallback | null = null;
  private onZoomCallback: ZoomCallback | null = null;
  private shootLocked = false;
  private isMouseDown = false;
  private isRightMouseDown = false;
  private autoFireInterval: ReturnType<typeof setInterval> | null = null;
  private lastForward = 0;
  private lastRight = 0;
  private lastJump = false;
  private lastSprint = false;
  private syncInterval: ReturnType<typeof setInterval> | null = null;
  private isMobile: boolean;
  
  constructor(scene: Scene, isMobile: boolean = false) {
    this.scene = scene;
    this.isMobile = isMobile;
    this.setupKeyboardObservable();
    
    // Only set up pointer shooting on desktop
    // Mobile uses explicit button via triggerShoot()
    if (!isMobile) {
      this.setupPointerObservable();
    }
    
    this.startSyncLoop();
  }
  
  private setupKeyboardObservable() {
    this.scene.onKeyboardObservable.add((kbInfo: KeyboardInfo) => {
      const key = kbInfo.event.key.toLowerCase();
      
      // Handle action keys on keydown only
      if (kbInfo.type === KeyboardEventTypes.KEYDOWN) {
        if (key === 'q') {
          kbInfo.event.preventDefault();
          this.onDropCallback?.();
          return;
        }
        if (key === 'e') {
          kbInfo.event.preventDefault();
          this.onPickupCallback?.();
          return;
        }
        if (key === 'r') {
          kbInfo.event.preventDefault();
          this.onReloadCallback?.();
          return;
        }
      }
      
      // Handle movement keys (including shift for sprint)
      if (!['w', 'a', 's', 'd', ' ', 'shift'].includes(key)) {
        return;
      }
      
      kbInfo.event.preventDefault();
      
      const isPressed = kbInfo.type === KeyboardEventTypes.KEYDOWN;
      this.keys.set(key, isPressed);
      
      // Fire immediately on key change
      const { forward, right } = this.getMovementInput();
      const jump = this.keys.get(' ') || false;
      const sprint = this.keys.get('shift') || false;
      this.lastForward = forward;
      this.lastRight = right;
      this.lastJump = jump;
      this.lastSprint = sprint;
      
      if (this.onStateChangeCallback) {
        this.onStateChangeCallback(forward, right, jump, sprint);
      }
    });
  }
  
  /**
   * Continuously send input at 30Hz so the server gets updated camera yaw
   * even when standing still (keeps character rotation synced with camera).
   * 30Hz keeps max yaw desync to ~33ms.
   */
  private startSyncLoop() {
    this.syncInterval = setInterval(() => {
      // Always send, even when standing still (for camera rotation sync)
      if (this.onStateChangeCallback) {
        this.onStateChangeCallback(this.lastForward, this.lastRight, this.lastJump, this.lastSprint);
      }
    }, 33); // ~30Hz continuous
  }
  
  getMovementInput(): { forward: number; right: number } {
    let forward = 0;
    let right = 0;
    
    if (this.keys.get('w')) forward += 1;
    if (this.keys.get('s')) forward -= 1;
    if (this.keys.get('d')) right += 1;
    if (this.keys.get('a')) right -= 1;
    
    return { forward, right };
  }
  
  private setupPointerObservable() {
    this.scene.onPointerObservable.add((pointerInfo) => {
      // Left-click fires shoot
      if (pointerInfo.type === PointerEventTypes.POINTERDOWN) {
        const evt = pointerInfo.event as PointerEvent;
        if (evt.button === 0) {
          if (this.shootLocked) return;
          this.shootLocked = true;
          this.isMouseDown = true;
          this.onShootCallback?.();
        }
        // Right-click for zoom (skip if build system needs it)
        if (evt.button === 2) {
          if (this.shouldSkipRightClick?.()) {
            // BuildSystem will handle this
            return;
          }
          evt.preventDefault();
          this.isRightMouseDown = true;
          this.onZoomCallback?.(true);
        }
      }
      // Unlock on pointer up
      if (pointerInfo.type === PointerEventTypes.POINTERUP) {
        const evt = pointerInfo.event as PointerEvent;
        if (evt.button === 0) {
          this.shootLocked = false;
          this.isMouseDown = false;
        }
        // Release right-click zoom
        if (evt.button === 2) {
          if (this.shouldSkipRightClick?.()) {
            // BuildSystem will handle this
            return;
          }
          this.isRightMouseDown = false;
          this.onZoomCallback?.(false);
        }
      }
    });
  }

  onStateChange(callback: InputStateChangeCallback) {
    this.onStateChangeCallback = callback;
  }

  onShoot(callback: ShootCallback) {
    this.onShootCallback = callback;
  }

  onDrop(callback: DropCallback) {
    this.onDropCallback = callback;
  }

  onPickup(callback: PickupCallback) {
    this.onPickupCallback = callback;
  }

  onReload(callback: ReloadCallback) {
    this.onReloadCallback = callback;
  }
  
  onZoom(callback: ZoomCallback) {
    this.onZoomCallback = callback;
  }

  /** Set a function to check if right-click should be skipped (for BuildSystem). */
  setSkipRightClickCheck(callback: () => boolean) {
    this.shouldSkipRightClick = callback;
  }

  /** Trigger a shoot event externally (e.g. from touch button). */
  triggerShoot() {
    this.onShootCallback?.();
  }

  /** Get the current input state. */
  getCurrentState(): { forward: number; right: number; jump: boolean } {
    return {
      forward: this.lastForward,
      right: this.lastRight,
      jump: this.lastJump
    };
  }
  
  /** Check if left mouse button is currently held down. */
  isMouseHeld(): boolean {
    return this.isMouseDown;
  }
  
  /** Check if right mouse button is currently held down. */
  isRightMouseHeld(): boolean {
    return this.isRightMouseDown;
  }
  
  dispose() {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
    }
    if (this.autoFireInterval) {
      clearInterval(this.autoFireInterval);
      this.autoFireInterval = null;
    }
    this.keys.clear();
    this.onStateChangeCallback = null;
    this.onShootCallback = null;
    this.onDropCallback = null;
    this.onReloadCallback = null;
    this.onZoomCallback = null;
  }
}
