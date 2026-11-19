import * as lettersRepo from '@/lib/letters-repo';
import * as squareRepo from '@/lib/square-repo';
import * as storiesRepo from '@/lib/stories-repo';
import type { ContentBackend } from '@/lib/backend/types';

/**
 * 本地实现：全部数据写入浏览器 IndexedDB。
 *
 * 这一层没有额外逻辑，只做接口适配 ——
 * 好处是业务代码完全不需要知道"数据存在哪里"。
 */
export const localBackend: ContentBackend = {
  mode: 'local',

  listStories: storiesRepo.listStories,
  createStory: storiesRepo.createStory,
  updateStory: storiesRepo.updateStory,
  deleteStory: storiesRepo.deleteStory,

  listPosts: squareRepo.listPosts,
  getQuotaUsage: squareRepo.getQuotaUsage,
  createPost: squareRepo.createPost,
  setPostStatus: squareRepo.setPostStatus,
  deletePost: squareRepo.deletePost,
  deleteOwnPost: squareRepo.deleteOwnPost,
  // 本机模式下一个设备就是一个访客，仓储层自己记得有没有抱过
  hugPost: (id, _visitorId, want) => squareRepo.hugPost(id, want),
  addReply: squareRepo.addReply,
  deleteReply: squareRepo.deleteReply,
  deleteOwnReply: squareRepo.deleteOwnReply,

  listLetters: lettersRepo.listLetters,
  createLetter: lettersRepo.createLetter,
  openLetter: lettersRepo.openLetter,
  deleteLetter: lettersRepo.deleteLetter,

  listCapsules: lettersRepo.listCapsules,
  createCapsule: lettersRepo.createCapsule,
  openCapsule: lettersRepo.openCapsule,
  deleteCapsule: lettersRepo.deleteCapsule,
};
