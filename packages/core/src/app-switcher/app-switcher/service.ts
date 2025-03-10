import { inject, interfaces } from 'inversify';

import { ISwitcherStatus, ISwitcherStatusKey } from '../../enum/status';
import { IHooks, IHooksKey } from '../../hooks/interface';
import { IRouter, IRouterKey } from '../../navigation/router/interface';
import { lazyInject, provide } from '../../provider';
import { IStarter, IStarterKey } from '../../starter/interface';
import { IAppSwitcherContext, IAppSwitcherContextKey } from '../app-switcher-context/interface';
import { ILoaderKey, ILoader } from '../loader/interface';
import { IRendererKey, IRenderer } from '../renderer/interface';
import { IRouteStateKey, IRouteState } from '../route-state/interface';
import { IAppSwitcher, IAppSwitcherKey, SwitcherOptions } from './interface';

export * from './interface';

@provide(IAppSwitcherKey)
export class AppSwitcher implements IAppSwitcher {
  @lazyInject(IRouterKey) protected readonly _router!: IRouter;

  @lazyInject(IStarterKey) protected readonly _starter!: IStarter;

  public context: IAppSwitcherContext | null = null;

  public currentContext: IAppSwitcherContext | null = null;

  protected readonly _AppSwitcherContext: interfaces.Newable<IAppSwitcherContext>;

  protected readonly _SwitcherStatus: ISwitcherStatus;

  protected readonly _loader: ILoader;

  protected readonly _renderer: IRenderer;

  protected readonly _routeState: IRouteState;

  protected readonly _hooks: IHooks;

  constructor(
    /* eslint-disable @typescript-eslint/naming-convention */
    @inject(IAppSwitcherContextKey) AppSwitcherContext: interfaces.Newable<IAppSwitcherContext>,
    @inject(ISwitcherStatusKey) SwitcherStatus: ISwitcherStatus,
    /* eslint-enable @typescript-eslint/naming-convention */
    @inject(ILoaderKey) loader: ILoader,
    @inject(IRendererKey) renderer: IRenderer,
    @inject(IRouteStateKey) routeState: IRouteState,
    @inject(IHooksKey) hooks: IHooks,
  ) {
    this._AppSwitcherContext = AppSwitcherContext;
    this._SwitcherStatus = SwitcherStatus;

    this._loader = loader;
    this._renderer = renderer;
    this._routeState = routeState;
    this._hooks = hooks;
  }

  public async switch(options: SwitcherOptions): Promise<void> {
    // 每次调用 switch 都需要存储一个 context 和 nextContext，分别用于执行 cancel 和 run。
    // ------
    // 考虑这么一种的场景：
    // 多次连续调用 switch，会产生一个 context 序列，假设是 [context0, context1, context2]
    // 第一次调用 switch，初始状态 context0 run，最新 context 是 context0
    // 第二次调用 switch，等待 context0 cancel, 最新 context 是 context1
    // 第三次调用 switch，context0 还未 cancel 等待 context1 cancel，这里特别注意的，是 context1 而不是 context0，最新 context 是 context2
    // 上面的序列的正确执行顺序是 context0 run -> context0 cancel -> context1 cancel -> context0 cancel 完成 -> context1 run -> context1 cancel 完成 -> context2 run
    // 只有这样调用才类似一个 switch 链，不会跳过某个 context 不执行 cancel 或 run。
    const context = this.context;
    const nextContext = this._createSwitcherContext(options);
    this.context = nextContext;

    if (context) {
      await context.cancel();
    }

    this.currentContext = nextContext;
    return nextContext?.run({
      loader: this._loader,
      renderer: this._renderer,
    });
  }

  protected _createSwitcherContext(options: SwitcherOptions): IAppSwitcherContext {
    // @ts-expect-error 需要传入参数，但 inversify 这里的参数类型是 never
    return new this._AppSwitcherContext(options, {
      SwitcherStatus: this._SwitcherStatus,
      router: this._router,
      routeState: this._routeState,
      hooks: this._hooks,
      starter: this._starter,
    });
  }
}
