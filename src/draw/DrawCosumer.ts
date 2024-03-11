import {
  Process,
  Processor,
  OnQueueActive,
  OnQueueProgress,
} from '@nestjs/bull';
import { Job } from 'bull';
import { sendTackprompt } from 'src/ws/comfyuiapi';
import { WsGateway } from 'src/ws/ws.gateway';
import WebSocket = require('ws'); // 导入WebSocket模块
import { Logger } from '@nestjs/common';
import { DrawhistoryService } from 'src/drawhistory/drawhistory.service';
import { DrawService } from './DrawService';

@Processor('draw')
export class DrawConsumer {
  constructor(
    private readonly drawHistory: DrawhistoryService,
    private readonly drawService: DrawService,
  ) {}

  private readonly logger = new Logger(DrawConsumer.name);
  private readonly clientId = 'admin9527';
  public static ws_client: WebSocket;

  @Process('text2img')
  async text2img(job: Job) {
    this.logger.debug('Processing', job.id, 'for', 'seconds');
    await this.drawTaskExcu(job.data);
    this.logger.debug('Processing done', job.id);
  }

  //执行画画
  async drawTaskExcu(data) {
    const p1 = new Promise((resolve) => {
      //client_id为用户id
      this.websocketInit();
      const { client_id, prompt } = data;
      const params = {
        client_id: 'admin9527', //固定值
        prompt: prompt,
      };
      sendTackprompt(params).then((sendres: any) => {
        //监听服务器消息
        DrawConsumer.ws_client.onmessage = (event: any) => {
          //转发
          this.logger.debug(event.data);
          const userTask = WsGateway.userTasks.find(
            (item) => item.uid === client_id,
          );
          //如果存在并且socket处于连接状态
          if (userTask) {
            const target_socket = WsGateway.server.sockets?.sockets?.get(
              userTask.socket_id,
            );
            if (target_socket) {
              this.logger.debug(`发送给${userTask.socket_id},${event.data}`);
              target_socket.emit('message', event.data);
            }
          } else {
            this.logger.error('没有找到对应任务');
            resolve('没有找到对应任务');
          }
          const { type } = JSON.parse(event.data + '');
          this.logger.debug('@@@@@@type', type);
          if (type === 'executed') {
            const {
              data: {
                output: { images },
              },
            } = JSON.parse(event.data + '');
            if (images && images[0]?.filename.includes('final')) {
              const drawhistory = {
                user_id: client_id,
                prompt_id: sendres.prompt_id,
                draw_api: prompt,
                filename: images[0]?.filename,
                status: true,
              };
              //保存到数据库
              this.drawHistory
                .create(drawhistory)
                .catch((err) => {
                  this.logger.error(err);
                })
                .finally(() => {
                  this.logger.error('保存到数据成功了');
                  resolve('绘画任务最终完成');
                });
            }
          }
        };
      });
    });
    const p2 = new Promise((resolve, reject) => {
      setTimeout(() => {
        reject('Error.timeout……');
      }, 240000);
    });

    return Promise.race([p1, p2])
      .then(() => {
        this.logger.debug('绘图任务执行完成');
      })
      .catch(() => {
        this.logger.error('绘图任务执行异常');
      });
    // return new Promise((resolve, reject) => {
    //   Promise.race([p1, p2])
    //     .then(() => {
    //       this.logger.debug('绘图任务执行完成');
    //       resolve('执行完成');
    //     })
    //     .catch(() => {
    //       this.logger.error('绘图任务执行异常');
    //       reject('执行失败');
    //     });
    // });
    // p.then((response) => this.logger.debug(response));
    // p.catch((error) => this.logger.error(error));
  }

  /**
   * 初始化与绘画服务端的链接
   */
  async websocketInit() {
    if (!this.validateWsconnect()) {
      DrawConsumer.ws_client = new WebSocket(
        'ws://apps.gptpro.ink/websocket/ws?clientId=' + this.clientId,
      );
    }
  }

  /**
   * 验证链接状态
   */
  validateWsconnect() {
    if (
      DrawConsumer.ws_client === undefined ||
      DrawConsumer.ws_client.readyState != 1
    ) {
      return false;
    } else {
      DrawConsumer.ws_client.ping('', true, (e: any) => {
        this.logger.debug('当前的链接状态是否存在错误：', e);
        return !e;
      });
    }
    // return new Promise((resolve) => {
    //   if (
    //     DrawConsumer.ws_client === undefined ||
    //     DrawConsumer.ws_client.readyState != 1
    //   ) {
    //     resolve(false);
    //   } else {
    //     DrawConsumer.ws_client.ping('', true, (e: any) => {
    //       this.logger.debug('当前的链接状态是否存在错误：', e);
    //       if (e) {
    //         resolve(false);
    //       } else {
    //         resolve(true);
    //       }
    //     });
    //   }
    // });
  }

  @OnQueueActive()
  async onActive(job: Job) {
    const remain = await this.drawService.getQueueLength();
    //广播队列任务信息
    WsGateway.server.sockets?.emit('remain', { remain });
    this.logger.debug(
      `onActive job ${job.id} of type ${job.name} with data ${job.data}...队长：`,
      remain,
    );
  }

  @OnQueueProgress()
  onProgress(job: Job) {
    console.log(
      `Processing job ${job.id} of type ${job.name} with data ${job.data}...starting`,
    );
  }
}
