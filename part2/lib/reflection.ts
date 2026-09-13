/** The same concise first-person reflection is included in the submission. */
export const REFLECTION = {
  experience: '我遇到的最大性能陷阱，是 AI 把主动限频的推理频率当作渲染帧率，导致无效降档。我要求分别采集两类指标，并补上摄像头异常释放、粒子上限及边界测试。',
  prompt: '分别统计推理频率与渲染帧率，以渲染开销决定降档；逐条验证微笑下雨、大笑烟花与头部碰撞，标明模拟与真人证据。',
  boundary: '真人跨设备准确率与温升仍待验证。',
};
export const REFLECTION_TEXT = `${REFLECTION.experience}纠偏 Prompt：“${REFLECTION.prompt}”${REFLECTION.boundary}`;
