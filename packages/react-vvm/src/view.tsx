import {
  createContext,
  memo,
  useContext,
  useState,
  FC,
  createElement,
  useLayoutEffect,
  useRef,
  useEffect,
  PureComponent,
  RefAttributes,
  forwardRef,
} from "react";
import { observer } from "mobx-react";
import { action, autorun, reaction } from "mobx";
import { ASSIGN, PARENT, PROTOTYPE, VIEW_PROPS, ViewModel } from "./ViewModel";
import { Constructable } from "./types";
import { configuration } from "./configure";

// eslint-disable-next-line @typescript-eslint/naming-convention
declare const __DEV__: boolean;

const ViewModelContext = createContext<ViewModel | null>(null);

const createComponent = <P, V, R>(
  component: BaseComponent<P, V, R>,
  vmFactory: (props?: P) => ViewModel | null,
  options: TViewOptions<P> = {},
  vmName?: string,

  isForwardRef = (component as any).$$typeof ===
    Symbol.for("react.forward_ref"),
  Component?: any,
  viewModel?: any,
  element?: any
) => {
  Component = (props: P, ref: any) => {
    viewModel = vmFactory(props);

    element = createElement(
      // eslint-disable-next-line react-hooks/rules-of-hooks
      useState(() =>
        options.observer === false ? component : observer(component)
      )[0],
      ASSIGN({}, props, {
        viewModel,
        ref: isForwardRef ? ref : undefined,
      } as any)
    );

    if (vmName) {
      element = createElement(
        ViewModelContext.Provider,
        { value: viewModel },
        element
      );
    }

    return createElement(configuration.Wrapper, null, element);
  };

  if (isForwardRef) {
    Component = forwardRef(Component);
  }

  Component = memo(Component, options.propsAreEqual);

  if (__DEV__) {
    Component.displayName = `${!vmName ? "Child" : ""}View${
      vmName ? `@${vmName}` : ""
    }`;
  }

  return Component;
};

type TViewOptions<T> = {
  observer?: boolean;
  propsAreEqual?: (prevProps: Readonly<T>, nextProps: Readonly<T>) => boolean;
};

type FCWithRef<P, R> = FC<
  P & (R extends HTMLElement ? RefAttributes<R> : unknown)
>;

type BaseComponent<P, V, R> = FCWithRef<P & { viewModel: V }, R>;

const onViewMounted = "onViewMounted";
const onViewUpdated = "onViewUpdated";
const onViewUnmounted = "onViewUnmounted";

const onViewMountedSync = "onViewMountedSync";
const onViewUpdatedSync = "onViewUpdatedSync";
const onViewUnmountedSync = "onViewUnmountedSync";

const useLifeCycle = (
  hook: typeof useEffect,
  viewModel: any,
  onUpdated: string,
  onMounted: string,
  onUnmounted: string,
  updateCb: (() => void) | null,
  unmountCb?: () => void,

  // eslint-disable-next-line react-hooks/rules-of-hooks
  wasRendered = useRef(false)
) => {
  hook(() => {
    if (wasRendered.current) {
      updateCb && updateCb();
      viewModel[onUpdated] && viewModel[onUpdated]();
    }

    wasRendered.current = true;
  });

  hook(() => {
    viewModel[onMounted] && viewModel[onMounted]();

    return () => {
      unmountCb && unmountCb();
      viewModel[onUnmounted] && viewModel[onUnmounted]();
    };
  }, []);
};

/**
 * HOC-function that creates an instance of View. The View creates an instance of the ViewModel; passes its parent;
 * updates viewProps every time the View is re-rendered. Views are memoized with {@link React.memo}.
 * @param VM - ViewModel class.
 *
 * @example
 * type Props = {
 *   prop1: number;
 *   prop2: string;
 * }
 *
 * const SomeView = view(SomeViewModel)<Props>(({ viewModel, prop1, prop2 }) => (
 *   JSX here
 * ));
 */
export const view =
  <V extends ViewModel>(VM: Constructable<V>) =>
  <P, R extends HTMLElement | unknown = unknown>(
    ViewComponent: BaseComponent<P, V, R>,
    options?: TViewOptions<P>
  ): FCWithRef<P, R> =>
    createComponent(
      ViewComponent,
      (props, viewModel?: any) => {
        viewModel = useContext(ViewModelContext);
        viewModel = useState((vm?: any) => {
          PROTOTYPE[PARENT] = viewModel;
          PROTOTYPE[VIEW_PROPS] = props;
          vm = configuration.vmFactory(VM);
          delete PROTOTYPE[PARENT];
          delete PROTOTYPE[VIEW_PROPS];
          return vm;
        })[0];

        useLifeCycle(
          useEffect,
          viewModel,
          onViewUpdated,
          onViewMounted,
          onViewUnmounted,
          null,
          () =>
            (viewModel.d = viewModel.d.filter((it: () => void) => {
              it();
            }))
        );

        useLifeCycle(
          useLayoutEffect,
          viewModel,
          onViewUpdatedSync,
          onViewMountedSync,
          onViewUnmountedSync,
          action(() => (viewModel[VIEW_PROPS] = props))
        );

        return viewModel;
      },
      options,
      VM.name || "Anonymous"
    );

/**
 * HOC-function that creates an instance of ChildView. ChildView doesn't create or affect on the ViewModel, it only
 * uses one. ChildViews are memoized with {@link React.memo}.
 */
export const childView =
  <V extends ViewModel>() =>
  <P, R extends HTMLElement | unknown = unknown>(
    ChildViewComponent: BaseComponent<P, V, R>,
    options?: TViewOptions<P>
  ): FCWithRef<P, R> =>
    createComponent(
      ChildViewComponent,
      () => useContext(ViewModelContext),
      options
    );

for (const [f, name] of [
  [autorun, "autorun"] as const,
  [reaction, "reaction"] as const,
]) {
  PROTOTYPE[name] = function () {
    // eslint-disable-next-line prefer-rest-params
    return this.d[this.d.push((f as any).apply(0, arguments)) - 1];
  };
}

// REFLECT.decorate(
//   [observable.ref, REFLECT.metadata("design:type", OBJECT)],
//   PROTOTYPE,
//   VIEW_PROPS
// );

/**
 * A class with which you can create a ChildView. The context of this class is equals to a view model. And also
 * there's a typed getter viewModel, which is just an alias of the context field.
 */
export class ChildViewComponent<
  V,
  P = unknown,
  S = unknown,
  SS = any
> extends PureComponent<P, S, SS> {
  static contextType = ViewModelContext;

  get viewModel(): V {
    return this.context as V;
  }
}
