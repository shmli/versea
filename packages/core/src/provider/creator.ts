/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import 'reflect-metadata';
import { logWarn, VerseaError } from '@versea/shared';
import {
  decorate,
  injectable,
  ContainerModule,
  METADATA_KEY as inversify_METADATA_KEY,
  interfaces,
  BindingTypeEnum,
} from 'inversify';

import { VERSEA_METADATA_LAZY_INJECT_KEY, VERSEA_METADATA_INJECTION_KEY } from '../constants';

interface ProvideSyntax {
  implementationType: unknown;
  bindingType: interfaces.BindingType;
  serviceIdentifier: interfaces.ServiceIdentifier;
  replace?: (current: unknown, previous: unknown) => unknown;
}
interface CreateProviderReturnType {
  provide: (
    serviceIdentifier: interfaces.ServiceIdentifier,
    bindingType?: 'Constructor' | 'Instance',
  ) => (target: any) => any;
  provideValue: <T = unknown>(
    target: any,
    serviceIdentifier: interfaces.ServiceIdentifier,
    bindingType?: 'ConstantValue' | 'DynamicValue' | 'Function' | 'Provider',
    replace?: (previous: T, current: T) => T,
  ) => any;
  buildProviderModule: (container: interfaces.Container) => interfaces.ContainerModule;
}

function toString(serviceIdentifier: interfaces.ServiceIdentifier): string {
  if (typeof serviceIdentifier === 'function') {
    return serviceIdentifier.name;
  }
  if (typeof serviceIdentifier === 'object') {
    return 'unknown';
  }
  return serviceIdentifier.toString();
}

// eslint-disable-next-line @typescript-eslint/naming-convention
function appendMetadata(metadata: ProvideSyntax, MetaDataKey: string): ProvideSyntax {
  const previousMetadata: ProvideSyntax[] = Reflect.getMetadata(MetaDataKey, Reflect) || [];
  const newMetadata: ProvideSyntax[] = [...previousMetadata];

  const index = previousMetadata.findIndex((item) => item.serviceIdentifier === metadata.serviceIdentifier);
  if (index < 0) {
    newMetadata.push(metadata);
  } else {
    const previousBindingType = previousMetadata[index].bindingType;
    const currentBindingType = metadata.bindingType;

    if (previousBindingType !== currentBindingType) {
      throw new VerseaError(
        `Provide Error: replace serviceIdentifier ${toString(metadata.serviceIdentifier)} with different bindingType.`,
      );
    }

    if (currentBindingType === 'Constructor' || currentBindingType === 'Instance') {
      // eslint-disable-next-line @typescript-eslint/ban-types
      const previousTarget = previousMetadata[index].implementationType as Function;
      // eslint-disable-next-line @typescript-eslint/ban-types
      const currentTarget = metadata.implementationType as Function;
      if (!(currentTarget.prototype instanceof previousTarget)) {
        throw new VerseaError(
          `Provide Error: replace serviceIdentifier ${toString(metadata.serviceIdentifier)} with different instance.`,
        );
      }
    }

    const previous = newMetadata[index];
    const replace = metadata.replace ?? previous.replace;

    if (replace) {
      newMetadata[index] = {
        ...metadata,
        implementationType: replace(previous.implementationType, metadata.implementationType),
        replace,
      };
    } else {
      logWarn(
        `Provide Warning: duplicated serviceIdentifier ${toString(
          metadata.serviceIdentifier,
        )}, use new value to replace old value.`,
      );

      newMetadata[index] = metadata;
    }
  }

  Reflect.defineMetadata(MetaDataKey, newMetadata, Reflect);
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  return newMetadata.find((item) => item.serviceIdentifier === metadata.serviceIdentifier)!;
}

// eslint-disable-next-line @typescript-eslint/naming-convention
export function createProvider(MetaDataKey: string): CreateProviderReturnType {
  function provide(
    serviceIdentifier: interfaces.ServiceIdentifier,
    bindingType: 'Constructor' | 'Instance' = 'Instance',
  ) {
    return function (target: any): any {
      // eslint-disable-next-line @typescript-eslint/ban-types
      const isAlreadyDecorated = Reflect.hasOwnMetadata(inversify_METADATA_KEY.PARAM_TYPES, target as Object);
      if (!isAlreadyDecorated) {
        decorate(injectable(), target);
      }

      appendMetadata(
        {
          serviceIdentifier,
          bindingType,
          implementationType: target,
        },
        MetaDataKey,
      );
      return target;
    };
  }

  function provideValue<T = unknown>(
    target: any,
    serviceIdentifier: interfaces.ServiceIdentifier,
    bindingType: 'ConstantValue' | 'DynamicValue' | 'Function' | 'Provider' = 'ConstantValue',
    replace?: (previous: T, current: T) => T,
  ): any {
    const metadata = appendMetadata(
      {
        serviceIdentifier,
        bindingType,
        implementationType: target,
        replace: replace as (current: unknown, previous: unknown) => unknown,
      },
      MetaDataKey,
    );
    return metadata.implementationType;
  }

  function buildProviderModule(container: interfaces.Container): interfaces.ContainerModule {
    return new ContainerModule((bind) => {
      const provideMetadata: ProvideSyntax[] = Reflect.getMetadata(MetaDataKey, Reflect) || [];

      function bindLazyInjection(context: interfaces.Context, implementation: unknown): unknown {
        /* eslint-disable @typescript-eslint/no-unsafe-member-access */
        const metadata: Record<string, interfaces.ServiceIdentifier> =
          Reflect.getMetadata(VERSEA_METADATA_LAZY_INJECT_KEY, implementation as object) || {};
        Object.keys(metadata).forEach((key) => {
          Object.defineProperty(implementation, key, {
            configurable: true,
            enumerable: true,
            get(this: object) {
              if (Reflect.hasMetadata(VERSEA_METADATA_INJECTION_KEY, this, key)) {
                /* istanbul ignore next */
                // eslint-disable-next-line @typescript-eslint/no-unsafe-return
                return Reflect.getMetadata(VERSEA_METADATA_INJECTION_KEY, this, key);
              }
              return context.container.get(metadata[key]);
            },
            set(this: object, newValue: any) {
              /* istanbul ignore next */
              Reflect.defineMetadata(VERSEA_METADATA_INJECTION_KEY, newValue, this, key);
            },
          });
        });
        /* eslint-enable @typescript-eslint/no-unsafe-member-access */
        return implementation;
      }

      provideMetadata.forEach(({ serviceIdentifier, implementationType, bindingType }) => {
        if (bindingType === BindingTypeEnum.Factory) {
          /* istanbul ignore next */
          throw new VerseaError('Auto Binding Module Error: can not auto bind factory.');
        }

        if (bindingType === BindingTypeEnum.ConstantValue) {
          return bind(serviceIdentifier).toConstantValue(implementationType);
        }
        if (bindingType === BindingTypeEnum.Constructor) {
          return bind(serviceIdentifier).toConstructor(implementationType as interfaces.Newable<unknown>);
        }
        if (bindingType === BindingTypeEnum.DynamicValue) {
          /* istanbul ignore next */
          return bind(serviceIdentifier).toDynamicValue(implementationType as interfaces.DynamicValue<unknown>);
        }
        if (bindingType === BindingTypeEnum.Function) {
          /* istanbul ignore next */
          return bind(serviceIdentifier).toFunction(implementationType);
        }
        if (bindingType === BindingTypeEnum.Provider) {
          /* istanbul ignore next */
          return bind(serviceIdentifier).toProvider(implementationType as interfaces.ProviderCreator<unknown>);
        }
        return bind(serviceIdentifier)
          .to(implementationType as new (...args: never[]) => unknown)
          .onActivation(bindLazyInjection);
      });

      // 自动实例化所有依赖
      provideMetadata.forEach(({ serviceIdentifier }) => {
        container.get(serviceIdentifier);
      });
    });
  }

  return {
    provide,
    provideValue,
    buildProviderModule,
  };
}
