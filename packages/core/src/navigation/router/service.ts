import { VerseaCanceledError } from '@versea/shared';
import { inject } from 'inversify';
import { parse } from 'query-string';

import { IAppSwitcher } from '../../app-switcher/app-switcher/service';
import { IApp } from '../../application/app/service';
import { provide } from '../../provider';
import { IMatcher, IMatcherKey, MatchedRoutes } from '../matcher/service';
import { callCapturedEventListeners } from '../navigation-events';
import { RouteConfig } from '../route/service';
import { IRouter, IRouterKey } from './interface';

export * from './interface';

@provide(IRouterKey)
export class Router implements IRouter {
  public isStarted = false;

  protected readonly _matcher: IMatcher;

  constructor(@inject(IMatcherKey) matcher: IMatcher) {
    this._matcher = matcher;
  }

  public addRoutes(routes: RouteConfig[], app: IApp): void {
    this._matcher.addRoutes(routes, app);
  }

  public match(): MatchedRoutes {
    const path = window.location.pathname;
    const query = parse(window.location.search);
    return this._matcher.match(path, query);
  }

  public async reroute(appSwitcher: IAppSwitcher, navigationEvent?: Event): Promise<void> {
    try {
      await appSwitcher.switch({
        navigationEvent,
        matchedRoutes: this.match(),
      });
    } catch (error) {
      if (!(error instanceof VerseaCanceledError)) {
        throw error;
      }
    }
  }

  public callCapturedEventListeners(navigationEvent?: Event): void {
    callCapturedEventListeners(navigationEvent);
  }

  public async start(appSwitcher: IAppSwitcher): Promise<void> {
    if (this.isStarted) {
      if (process.env.NODE_ENV !== 'production') {
        console.warn('Versea has already started, it should not start again.');
        return;
      }
    }

    this.isStarted = true;
    return this.reroute(appSwitcher);
  }
}
