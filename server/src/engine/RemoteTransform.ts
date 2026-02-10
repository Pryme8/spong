import { TransformNode, Scene, Quaternion } from '@babylonjs/core';
import {
  TransformData,
  InputData,
  CharacterState,
  CharacterInput,
  createCharacterState,
  stepCharacter
} from '@spong/shared';

export class RemoteTransform {
  readonly entityId: number;
  private node: TransformNode;
  private state: CharacterState;
  private lastProcessedInput: number = 0;

  // Current input (updated by network, consumed by tick)
  private input: CharacterInput = {
    forward: 0,
    right: 0,
    cameraYaw: 0,
    jump: false
  };

  constructor(entityId: number, scene: Scene) {
    this.entityId = entityId;
    this.node = new TransformNode(`remote_${entityId}`, scene);
    this.node.rotationQuaternion = Quaternion.Identity();
    this.state = createCharacterState();
  }

  /** Accept a new input packet from the client. */
  setInput(input: InputData) {
    if (input.sequence <= this.lastProcessedInput) return;
    this.lastProcessedInput = input.sequence;

    this.input.forward = input.forward;
    this.input.right = input.right;
    this.input.cameraYaw = input.cameraYaw;
    this.input.jump = input.jump;
  }

  /** Run one fixed-timestep tick using the shared kinematic controller. */
  tick(dt: number) {
    stepCharacter(this.state, this.input, dt);

    // Sync TransformNode from state
    this.node.position.set(this.state.posX, this.state.posY, this.state.posZ);
    this.node.rotationQuaternion!.set(
      0,
      Math.sin(this.state.yaw * 0.5),
      0,
      Math.cos(this.state.yaw * 0.5)
    );
  }

  serialize(): TransformData {
    return {
      entityId: this.entityId,
      position: {
        x: this.state.posX,
        y: this.state.posY,
        z: this.state.posZ
      },
      rotation: {
        x: this.node.rotationQuaternion!.x,
        y: this.node.rotationQuaternion!.y,
        z: this.node.rotationQuaternion!.z,
        w: this.node.rotationQuaternion!.w
      },
      velocity: {
        x: this.state.velX,
        y: this.state.velY,
        z: this.state.velZ
      },
      headPitch: 0, // RemoteTransform doesn't track head pitch (handled by Room's PlayerComponent)
      lastProcessedInput: this.lastProcessedInput
    };
  }

  getNode(): TransformNode {
    return this.node;
  }

  dispose() {
    this.node.dispose();
  }
}
